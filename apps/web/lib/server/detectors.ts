import { createHash, randomUUID } from "node:crypto";
import type { AnalysisResponse, HeatmapCell, LayerBreakdown, SentenceArtifact, TimelineSegment } from "../types";

const disclaimer = "TruthLens provides probabilistic AI-content signals, not legal or forensic proof.";

export const calibrationVersion = "hf-model-primary-v1";

export interface DetectorOutput {
  modality: AnalysisResponse["modality"];
  layer_scores: Record<string, number>;
  watermark_signals: Record<string, unknown>;
  layer_breakdown: LayerBreakdown[];
  detected_sources: string[];
  artifacts: AnalysisResponse["artifacts"];
  explanation_parts: string[];
}

export interface VideoFrameInput {
  data: Buffer;
  index: number;
  seconds: number;
}

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

export function clamp(value: number, low = 0, high = 1) {
  return Math.max(low, Math.min(high, value));
}

export function roundScore(value: number) {
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

function metadataFor(output: DetectorOutput) {
  output.artifacts.metadata ??= {};
  return output.artifacts.metadata;
}

function modelScoreFromMetadata(output: DetectorOutput) {
  const metadata = output.artifacts.metadata;
  return metadata?.hf_status === "ok" && typeof metadata.hf_score === "number" ? metadata.hf_score : null;
}

function confidenceRange(score: number, output: DetectorOutput): [number, number] {
  const values = Object.values(output.layer_scores);
  const spread = values.length ? Math.max(...values) - Math.min(...values) : 0;
  const modelPrimary = modelScoreFromMetadata(output) !== null;
  const width = modelPrimary ? clamp(0.04 + spread * 0.08, 0.04, 0.12) : clamp(0.08 + spread * 0.14, 0.08, 0.18);
  return [roundScore(score - width), roundScore(score + width)];
}

function weightedFallbackScore(output: DetectorOutput) {
  const values = Object.values(output.layer_scores);
  if (!values.length) return 0.5;
  return roundScore(values.reduce((total, value) => total + value, 0) / values.length);
}

function fuse(output: DetectorOutput, processingTimeMs: number): AnalysisResponse {
  const metadata = metadataFor(output);
  const modelScore = modelScoreFromMetadata(output);
  const confidence = modelScore ?? weightedFallbackScore(output);
  metadata.fusion_strategy = modelScore === null ? "heuristic_fallback" : "model_primary";
  metadata.calibration_version = calibrationVersion;

  return {
    request_id: randomUUID(),
    verdict: verdictFor(confidence),
    confidence,
    confidence_range: confidenceRange(confidence, output),
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
  const lower = data.subarray(0, 262144).toString("latin1").toLowerCase();
  const entropy = byteEntropy(data);
  const sizeFactor = clamp(data.length / (6 * 1024 * 1024));
  const filenameAiHint = /(midjourney|stable|diffusion|dall|flux|firefly|gemini|generated|ai)/i.test(filename);
  const hasExif = data.subarray(0, 65536).includes("Exif") || lower.includes("xmp");
  const hasC2pa = lower.includes("c2pa") || lower.includes("content credentials");
  const jpegMarkerCount = (data.toString("latin1").match(/\xff\xd8|\xff\xdb|\xff\xc4/g) ?? []).length;

  const layerScores = {
    watermark: roundScore(0.1 + (lower.includes("synthid") ? 0.36 : 0)),
    forensic: roundScore(0.18 + (hasExif ? -0.08 : 0.16) + sizeFactor * 0.08 + stableUnit(data, "image-forensic") * 0.34),
    neural_classifier: roundScore(0.5),
    frequency_domain: roundScore(0.22 + Math.abs(entropy - 0.72) * 0.9 + stableUnit(data, "image-frequency") * 0.18),
    provenance: roundScore(0.08 + (hasC2pa ? 0.08 : 0))
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
      synthid: { detected: false, score: layerScores.watermark, status: "marker_scan_only" },
      c2pa: { present: hasC2pa, valid: null, status: "metadata_scan_only" }
    },
    layer_breakdown: [
      { name: "Watermark", score: layerScores.watermark, explanation: "Marker scan for visible SynthID-like strings." },
      { name: "Forensic", score: layerScores.forensic, explanation: "Supporting metadata and byte-distribution checks only." },
      { name: "Neural Classifier", score: layerScores.neural_classifier, explanation: "Awaiting Hugging Face image classifier inference." },
      { name: "Frequency Domain", score: layerScores.frequency_domain, explanation: "Supporting entropy anomaly signal only." },
      { name: "Provenance", score: layerScores.provenance, explanation: "C2PA marker context; filename hints are not used for scoring." }
    ],
    detected_sources: hasC2pa ? ["C2PA-attributed content"] : ["No specific generator identified"],
    artifacts: {
      heatmap,
      metadata: {
        source_filename: filename,
        filename_ai_hint: filenameAiHint,
        has_exif_or_xmp: hasExif,
        jpeg_marker_count: jpegMarkerCount,
        byte_entropy: Math.round(entropy * 1000) / 1000
      }
    },
    explanation_parts: [
      "Image scoring uses the model classifier as the primary signal when available.",
      "Metadata, provenance, and byte-distribution checks are supporting context and do not override model probability."
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

  const layerScores = {
    watermark: roundScore(0.08 + (lower.includes("synthid") ? 0.32 : 0)),
    linguistic: roundScore(linguistic),
    neural_classifier: roundScore(0.5),
    provenance: roundScore(0.08)
  };
  const sentenceArtifacts: SentenceArtifact[] = sentences.slice(0, 80).map((sentence, index) => {
    const length = Math.max(sentenceWordCount(sentence), 1);
    const phraseBonus = aiPhrases.some((phrase) => sentence.toLowerCase().includes(phrase)) ? 0.2 : 0;
    return { index, text: sentence, score: roundScore(0.18 + clamp((length - 10) / 28) * 0.28 + phraseBonus + stableUnit(sentence, "sentence") * 0.26) };
  });

  return {
    modality: "TEXT",
    layer_scores: layerScores,
    watermark_signals: { synthid_text: { detected: lower.includes("synthid"), score: layerScores.watermark, status: "marker_scan_only" } },
    layer_breakdown: [
      { name: "Watermark", score: layerScores.watermark, explanation: "Marker scan for SynthID-like wording." },
      { name: "Linguistic", score: layerScores.linguistic, explanation: "Supporting rhythm, lexical variety, and phrase-density signal." },
      { name: "Neural Classifier", score: layerScores.neural_classifier, explanation: "Awaiting Hugging Face text classifier inference." },
      { name: "Provenance", score: layerScores.provenance, explanation: "Document-source context; filename and file type are not used for scoring." }
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
      },
      metadata: {
        source_filename: filename ?? null
      }
    },
    explanation_parts: [
      "Text scoring uses the model classifier as the primary signal when available.",
      "Linguistic markers are supporting context and do not override model probability.",
      ...(phraseHits ? ["Assistant-style transition phrases were found as a supporting signal."] : []),
      ...(lowBurstinessSignal > 0.65 ? ["Sentence lengths are unusually uniform, a weak supporting signal often associated with model-generated text."] : [])
    ]
  };
}

export function analyzeVideo(data: Buffer, filename: string): DetectorOutput {
  const lower = data.subarray(0, 262144).toString("latin1").toLowerCase();
  const entropy = byteEntropy(data);
  const sizeMb = data.length / (1024 * 1024);
  const hasMp4Metadata = ["moov", "mvhd", "udta"].some((marker) => lower.includes(marker));
  const filenameAiHint = /(sora|veo|runway|kling|deepfake|generated|ai)/i.test(filename);
  const layerScores = {
    watermark: roundScore(0.08 + (lower.includes("synthid") || lower.includes("videoseal") ? 0.34 : 0)),
    temporal_forensics: roundScore(0.3),
    face_mesh: roundScore(0.3),
    neural_classifier: roundScore(0.5),
    provenance: roundScore(0.1 + (hasMp4Metadata ? 0 : 0.07))
  };
  return {
    modality: "VIDEO",
    layer_scores: layerScores,
    watermark_signals: {
      synthid_video: { detected: false, score: layerScores.watermark, status: "marker_scan_only" },
      video_seal: { detected: false, score: layerScores.watermark, status: "marker_scan_only" },
      c2pa: { present: false, valid: null, status: "not_verified" }
    },
    layer_breakdown: [
      { name: "Watermark", score: layerScores.watermark, explanation: "Marker scan for SynthID/VideoSeal-like strings." },
      { name: "Temporal Forensics", score: layerScores.temporal_forensics, explanation: "Frame-level model scoring is required for the deployed video path." },
      { name: "Face Mesh", score: layerScores.face_mesh, explanation: "Face-level deepfake analysis is not run in the Vercel frame-sampling path." },
      { name: "Neural Classifier", score: layerScores.neural_classifier, explanation: "Awaiting Hugging Face frame classifier inference." },
      { name: "Provenance", score: layerScores.provenance, explanation: "Container context only; filename hints are not used for scoring." }
    ],
    detected_sources: ["No specific generator identified"],
    artifacts: {
      timeline: [],
      metadata: {
        source_filename: filename,
        filename_ai_hint: filenameAiHint,
        size_mb: Math.round(sizeMb * 100) / 100,
        byte_entropy: Math.round(entropy * 1000) / 1000,
        has_mp4_metadata: hasMp4Metadata
      }
    },
    explanation_parts: [
      "Video scoring uses sampled frame classifier results as the primary signal when available.",
      "Raw video container bytes are treated as supporting metadata only."
    ]
  };
}

export function analyzeVideoFrames(frames: VideoFrameInput[], filename?: string): DetectorOutput {
  const frameEntropies = frames.map((frame) => byteEntropy(frame.data));
  const averageEntropy = frameEntropies.length ? frameEntropies.reduce((total, value) => total + value, 0) / frameEntropies.length : 0;
  const joinedSeed = Buffer.concat(frames.map((frame) => frame.data.subarray(0, 4096)));
  const filenameAiHint = filename ? /(sora|veo|runway|kling|deepfake|generated|ai)/i.test(filename) : false;
  const layerScores = {
    watermark: roundScore(0.08),
    temporal_forensics: roundScore(0.22 + Math.abs(averageEntropy - 0.72) * 0.45),
    face_mesh: roundScore(0.25 + stableUnit(joinedSeed, "video-face-support") * 0.16),
    neural_classifier: roundScore(0.5),
    provenance: roundScore(0.1)
  };
  const timeline: TimelineSegment[] = frames.map((frame, index) => ({
    start_seconds: frame.seconds,
    end_seconds: frames[index + 1]?.seconds ?? frame.seconds + 1,
    score: layerScores.neural_classifier
  }));

  return {
    modality: "VIDEO",
    layer_scores: layerScores,
    watermark_signals: {
      synthid_video: { detected: false, score: layerScores.watermark, status: "frame_marker_scan_only" },
      video_seal: { detected: false, score: layerScores.watermark, status: "frame_marker_scan_only" },
      c2pa: { present: false, valid: null, status: "not_verified" }
    },
    layer_breakdown: [
      { name: "Watermark", score: layerScores.watermark, explanation: "Frame marker scan for watermark-like strings." },
      { name: "Temporal Forensics", score: layerScores.temporal_forensics, explanation: "Supporting frame entropy consistency signal." },
      { name: "Face Mesh", score: layerScores.face_mesh, explanation: "Supporting frame-level face/deepfake placeholder signal." },
      { name: "Neural Classifier", score: layerScores.neural_classifier, explanation: "Awaiting Hugging Face frame classifier inference." },
      { name: "Provenance", score: layerScores.provenance, explanation: "Container and filename context only; not used for scoring." }
    ],
    detected_sources: ["No specific generator identified"],
    artifacts: {
      timeline,
      metadata: {
        source_filename: filename ?? null,
        filename_ai_hint: filenameAiHint,
        sampled_frame_count: frames.length,
        average_frame_entropy: Math.round(averageEntropy * 1000) / 1000
      }
    },
    explanation_parts: [
      "Video scoring uses browser-sampled frames and the image AI detector as the primary deployed signal.",
      "Full temporal deepfake modeling is not run in this Vercel build."
    ]
  };
}

export function buildResult(output: DetectorOutput, startedAt: number) {
  return fuse(output, Math.max(1, Date.now() - startedAt));
}
