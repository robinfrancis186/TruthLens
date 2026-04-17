import { createHash, randomUUID } from "node:crypto";
import type { AnalysisResponse, HeatmapCell, LayerBreakdown, SentenceArtifact, TimelineSegment } from "../types";

const disclaimer = "TruthLens MVP provides probabilistic demo signals, not legal or forensic proof.";

export interface DetectorOutput {
  modality: AnalysisResponse["modality"];
  layer_scores: Record<string, number>;
  watermark_signals: Record<string, unknown>;
  layer_breakdown: LayerBreakdown[];
  detected_sources: string[];
  artifacts: AnalysisResponse["artifacts"];
  explanation_parts: string[];
}

const weights: Record<AnalysisResponse["modality"], Record<string, number>> = {
  IMAGE: {
    watermark: 0.18,
    forensic: 0.2,
    neural_classifier: 0.28,
    frequency_domain: 0.22,
    provenance: 0.12
  },
  VIDEO: {
    watermark: 0.14,
    temporal_forensics: 0.28,
    face_mesh: 0.18,
    neural_classifier: 0.26,
    provenance: 0.14
  },
  TEXT: {
    watermark: 0.06,
    linguistic: 0.45,
    neural_classifier: 0.42,
    provenance: 0.07
  }
};

const aiPhrases = [
  "in conclusion",
  "it is important to note",
  "moreover",
  "furthermore",
  "delve",
  "realm",
  "underscores",
  "plays a crucial role",
  "comprehensive",
  "seamless",
  "as an ai"
];

function clamp(value: number, low = 0, high = 1) {
  return Math.max(low, Math.min(high, value));
}

function roundScore(value: number) {
  return Math.round(clamp(value) * 1000) / 1000;
}

function stableUnit(seed: Buffer | string, salt: string) {
  const source = Buffer.isBuffer(seed) ? seed.subarray(0, 16384) : Buffer.from(seed, "utf8");
  const digest = createHash("sha256").update(source).update(salt).digest();
  return (digest.readUInt32BE(0) * 0x100000000 + digest.readUInt32BE(4)) / 0xffffffffffffffff;
}

function byteEntropy(data: Buffer) {
  if (!data.length) return 0;
  const sample = data.subarray(0, Math.min(data.length, 262144));
  const counts = new Array<number>(256).fill(0);
  for (let index = 0; index < sample.length; index += 1) {
    counts[sample[index]] += 1;
  }
  let entropy = 0;
  for (const count of counts) {
    if (count > 0) {
      const probability = count / sample.length;
      entropy -= probability * Math.log2(probability);
    }
  }
  return entropy / 8;
}

function likelySources(scores: Array<[string, number]>) {
  const selected = scores.filter(([, score]) => score >= 0.58).map(([name]) => name);
  return selected.slice(0, 3).length ? selected.slice(0, 3) : ["No specific generator identified"];
}

function verdictFor(score: number): AnalysisResponse["verdict"] {
  if (score >= 0.85) return "AI_GENERATED";
  if (score >= 0.62) return "LIKELY_AI";
  if (score >= 0.42) return "UNCERTAIN";
  if (score >= 0.22) return "LIKELY_HUMAN";
  return "HUMAN";
}

function sentenceWordCount(sentence: string) {
  return (sentence.match(/[A-Za-z][A-Za-z'-]*/g) ?? []).length;
}

function confidenceRange(score: number, layerScores: Record<string, number>): [number, number] {
  const values = Object.values(layerScores);
  const spread = Math.max(...values) - Math.min(...values);
  const width = clamp(0.06 + spread * 0.12, 0.06, 0.16);
  return [roundScore(score - width), roundScore(score + width)];
}

function fuse(output: DetectorOutput, processingTimeMs: number): AnalysisResponse {
  const outputWeights = weights[output.modality];
  const totalWeight = Object.values(outputWeights).reduce((total, weight) => total + weight, 0);
  const confidence = roundScore(
    Object.entries(outputWeights).reduce((total, [name, weight]) => total + (output.layer_scores[name] ?? 0) * weight, 0) / totalWeight
  );
  return {
    request_id: randomUUID(),
    verdict: verdictFor(confidence),
    confidence,
    confidence_range: confidenceRange(confidence, output.layer_scores),
    modality: output.modality,
    detected_sources: output.detected_sources,
    watermark_signals: output.watermark_signals,
    layer_scores: output.layer_scores,
    layer_breakdown: output.layer_breakdown,
    artifacts: output.artifacts,
    explanation: output.explanation_parts.join(" "),
    processing_time_ms: processingTimeMs,
    disclaimer
  };
}

export function analyzeImage(data: Buffer, filename: string): DetectorOutput {
  const name = filename.toLowerCase();
  const lower = data.subarray(0, 262144).toString("latin1").toLowerCase();
  const entropy = byteEntropy(data);
  const sizeFactor = clamp(data.length / (6 * 1024 * 1024));
  const filenameAiHint = /(midjourney|stable|diffusion|dall|flux|firefly|gemini|generated|ai)/.test(name) ? 1 : 0;
  const hasExif = data.subarray(0, 65536).includes("Exif") || lower.includes("xmp");
  const hasC2pa = lower.includes("c2pa") || lower.includes("content credentials");
  const jpegMarkerCount = (data.toString("latin1").match(/\xff\xd8|\xff\xdb|\xff\xc4/g) ?? []).length;

  const layerScores = {
    watermark: roundScore(0.1 + (lower.includes("synthid") ? 0.36 : 0) + filenameAiHint * 0.14),
    forensic: roundScore(0.18 + (hasExif ? -0.08 : 0.16) + sizeFactor * 0.08 + stableUnit(data, "image-forensic") * 0.34 + filenameAiHint * 0.08),
    neural_classifier: roundScore(0.34 + stableUnit(data, "image-neural") * 0.45 + filenameAiHint * 0.33),
    frequency_domain: roundScore(0.22 + Math.abs(entropy - 0.72) * 0.9 + stableUnit(data, "image-frequency") * 0.18 + filenameAiHint * 0.08),
    provenance: roundScore(0.08 + filenameAiHint * 0.78 + (hasC2pa ? 0.08 : 0))
  };
  const heatmap: HeatmapCell[] = Array.from({ length: 48 }, (_, index) => ({
    x: index % 8,
    y: Math.floor(index / 8),
    score: roundScore(0.22 + stableUnit(data, `heatmap-${index % 8}-${Math.floor(index / 8)}`) * 0.68)
  }));

  return {
    modality: "IMAGE",
    layer_scores: layerScores,
    watermark_signals: {
      synthid: { detected: false, score: layerScores.watermark, status: "demo_not_integrated" },
      c2pa: { present: hasC2pa, valid: null, status: "demo_metadata_scan" }
    },
    layer_breakdown: [
      { name: "Watermark", score: layerScores.watermark, explanation: "Demo scan for watermark-like byte markers only." },
      { name: "Forensic", score: layerScores.forensic, explanation: "Metadata presence, size, and byte-distribution heuristics." },
      { name: "Neural Classifier", score: layerScores.neural_classifier, explanation: "Deterministic pseudo-neural score for UI/API validation." },
      { name: "Frequency Domain", score: layerScores.frequency_domain, explanation: "Entropy-derived stand-in for FFT/DCT anomaly scoring." },
      { name: "Provenance", score: layerScores.provenance, explanation: "Filename and demo C2PA marker checks." }
    ],
    detected_sources:
      filenameAiHint || hasC2pa
        ? likelySources([
            ["Midjourney-style image", layerScores.neural_classifier],
            ["Stable Diffusion / Flux-style image", layerScores.frequency_domain],
            ["C2PA-attributed AI image", hasC2pa && filenameAiHint ? 0.72 : 0]
          ])
        : ["No specific generator identified"],
    artifacts: {
      heatmap,
      metadata: { has_exif_or_xmp: hasExif, jpeg_marker_count: jpegMarkerCount, byte_entropy: Math.round(entropy * 1000) / 1000 }
    },
    explanation_parts: [
      "Image analysis used deterministic MVP heuristics for metadata, byte distribution, filename hints, and pseudo-neural scoring.",
      "No real SynthID, C2PA verification, or AIDE model inference is integrated in this build.",
      ...(hasExif ? [] : ["No EXIF/XMP camera metadata was found in the inspected byte range, which is treated as weak synthetic-media evidence."]),
      ...(filenameAiHint ? ["The filename contains AI-generator wording, which increases provenance suspicion in this demo mode."] : [])
    ]
  };
}

export function analyzeText(text: string, filename?: string): DetectorOutput {
  const normalized = text.trim().replace(/\s+/g, " ");
  const sentences = normalized.split(/(?<=[.!?])\s+/).filter(Boolean);
  const words = normalized.toLowerCase().match(/[a-z][a-z'-]*/g) ?? [];
  const wordCount = words.length;
  const uniqueRatio = new Set(words).size / Math.max(wordCount, 1);
  const sentenceLengths = sentences.length ? sentences.map((sentence) => sentenceWordCount(sentence)) : [wordCount];
  const avgSentence = sentenceLengths.reduce((total, length) => total + length, 0) / sentenceLengths.length;
  const variance = sentenceLengths.reduce((total, length) => total + (length - avgSentence) ** 2, 0) / sentenceLengths.length;
  const burstiness = Math.sqrt(variance) / Math.max(avgSentence, 1);
  const lower = normalized.toLowerCase();
  const phraseHits = aiPhrases.reduce((total, phrase) => total + lower.split(phrase).length - 1, 0);
  const phraseSignal = clamp(phraseHits / Math.max(sentences.length, 1) / 0.6);
  const lowBurstinessSignal = clamp(1 - burstiness) * clamp((sentences.length - 2) / 3);
  const polishedLengthSignal = clamp((avgSentence - 12) / 18);
  const firstPersonCount = words.filter((word) => ["i", "me", "my", "mine", "we", "our", "ours"].includes(word)).length;
  const humanContextSignal = clamp((firstPersonCount / Math.max(wordCount, 1)) * 12 + clamp(uniqueRatio - 0.72) * 1.5);

  let linguistic = 0.2 + lowBurstinessSignal * 0.22 + polishedLengthSignal * 0.18 + phraseSignal * 0.42;
  if (phraseHits === 0) linguistic -= humanContextSignal * 0.2;
  let neural = 0.26 + stableUnit(normalized, "text-neural") * 0.12 + linguistic * 0.58 + phraseSignal * 0.08;
  if (phraseHits === 0) neural -= humanContextSignal * 0.14;

  const layerScores = {
    watermark: roundScore(0.08 + (lower.includes("synthid") ? 0.32 : 0)),
    linguistic: roundScore(linguistic),
    neural_classifier: roundScore(neural),
    provenance: roundScore(0.08 + (filename && /\.(docx|pdf)$/i.test(filename) ? 0.12 : 0))
  };
  const sentenceArtifacts: SentenceArtifact[] = sentences.slice(0, 80).map((sentence, index) => {
    const length = Math.max(sentenceWordCount(sentence), 1);
    const phraseBonus = aiPhrases.some((phrase) => sentence.toLowerCase().includes(phrase)) ? 0.2 : 0;
    return { index, text: sentence, score: roundScore(0.18 + clamp((length - 10) / 28) * 0.28 + phraseBonus + stableUnit(sentence, "sentence") * 0.26) };
  });

  return {
    modality: "TEXT",
    layer_scores: layerScores,
    watermark_signals: { synthid_text: { detected: lower.includes("synthid"), score: layerScores.watermark, status: "demo_marker_scan" } },
    layer_breakdown: [
      { name: "Watermark", score: layerScores.watermark, explanation: "Demo marker scan for SynthID-like wording only." },
      { name: "Linguistic", score: layerScores.linguistic, explanation: "Burstiness, sentence rhythm, lexical variety, and phrase-density heuristics." },
      { name: "Neural Classifier", score: layerScores.neural_classifier, explanation: "Deterministic pseudo-neural score for API and UI validation." },
      { name: "Provenance", score: layerScores.provenance, explanation: "Document-source context only; no text provenance standard is verified." }
    ],
    detected_sources: likelySources([
      ["General LLM-style prose", layerScores.linguistic],
      ["GPT-style assistant prose", phraseSignal],
      ["Gemini/SynthID text candidate", layerScores.watermark]
    ]),
    artifacts: {
      sentences: sentenceArtifacts,
      metrics: {
        word_count: wordCount,
        sentence_count: sentences.length,
        lexical_diversity: Math.round(uniqueRatio * 1000) / 1000,
        burstiness: Math.round(burstiness * 1000) / 1000,
        phrase_hits: phraseHits,
        human_context: Math.round(humanContextSignal * 1000) / 1000
      }
    },
    explanation_parts: [
      "Text analysis used deterministic MVP heuristics for sentence rhythm, burstiness, lexical variety, phrase signatures, and pseudo-neural scoring.",
      "Real SynthID text detection and transformer classifiers are not integrated in this build.",
      ...(phraseHits ? ["Repeated assistant-style transition phrases increased the AI-likelihood score."] : []),
      ...(lowBurstinessSignal > 0.65 ? ["Sentence lengths are unusually uniform, a weak signal often associated with model-generated text."] : [])
    ]
  };
}

export function analyzeVideo(data: Buffer, filename: string): DetectorOutput {
  const name = filename.toLowerCase();
  const lower = data.subarray(0, 262144).toString("latin1").toLowerCase();
  const entropy = byteEntropy(data);
  const sizeMb = data.length / (1024 * 1024);
  const filenameAiHint = /(sora|veo|runway|kling|deepfake|generated|ai)/.test(name) ? 1 : 0;
  const hasMp4Metadata = ["moov", "mvhd", "udta"].some((marker) => lower.includes(marker));
  const layerScores = {
    watermark: roundScore(0.08 + (lower.includes("synthid") || lower.includes("videoseal") ? 0.34 : 0)),
    temporal_forensics: roundScore(0.26 + stableUnit(data, "video-temporal") * 0.45 + filenameAiHint * 0.18),
    face_mesh: roundScore(0.24 + stableUnit(data, "video-face") * 0.42 + filenameAiHint * 0.14),
    neural_classifier: roundScore(0.3 + stableUnit(data, "video-neural") * 0.42 + clamp(sizeMb / 200) * 0.06),
    provenance: roundScore(0.1 + filenameAiHint * 0.45 + (hasMp4Metadata ? 0 : 0.07))
  };
  const timeline: TimelineSegment[] = Array.from({ length: 8 }, (_, index) => ({
    start_seconds: index * 5,
    end_seconds: index * 5 + 5,
    score: roundScore(0.2 + stableUnit(data, `video-segment-${index}`) * 0.68)
  }));
  return {
    modality: "VIDEO",
    layer_scores: layerScores,
    watermark_signals: {
      synthid_video: { detected: false, score: layerScores.watermark, status: "demo_not_integrated" },
      video_seal: { detected: false, score: layerScores.watermark, status: "demo_not_integrated" },
      c2pa: { present: false, valid: null, status: "demo_not_integrated" }
    },
    layer_breakdown: [
      { name: "Watermark", score: layerScores.watermark, explanation: "Demo marker scan for SynthID/VideoSeal-like strings." },
      { name: "Temporal Forensics", score: layerScores.temporal_forensics, explanation: "Deterministic stand-in for optical-flow and coherence analysis." },
      { name: "Face Mesh", score: layerScores.face_mesh, explanation: "Pseudo-score for face geometry and lip-sync inconsistency checks." },
      { name: "Neural Classifier", score: layerScores.neural_classifier, explanation: "Deterministic pseudo-neural score for video generator coverage." },
      { name: "Provenance", score: layerScores.provenance, explanation: "Container marker and filename provenance heuristics." }
    ],
    detected_sources: likelySources([
      ["Runway/Kling-style generated video", layerScores.temporal_forensics],
      ["Sora/Veo-style generated video", layerScores.neural_classifier],
      ["Face-swap/deepfake-style edit", layerScores.face_mesh]
    ]),
    artifacts: { timeline, metadata: { size_mb: Math.round(sizeMb * 100) / 100, byte_entropy: Math.round(entropy * 1000) / 1000, has_mp4_metadata: hasMp4Metadata } },
    explanation_parts: [
      "Video analysis used deterministic MVP heuristics for byte patterns, container markers, filename hints, and timeline scoring.",
      "Real frame extraction, MediaPipe face mesh, optical flow, VideoSeal, and deepfake model inference are deferred."
    ]
  };
}

export function buildResult(output: DetectorOutput, startedAt: number) {
  return fuse(output, Math.max(1, Date.now() - startedAt));
}
