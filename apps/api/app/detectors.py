from __future__ import annotations

import hashlib
import math
import re
import statistics
from dataclasses import dataclass
from pathlib import Path
from typing import Any


DISCLAIMER = "TruthLens MVP provides probabilistic demo signals, not legal or forensic proof."


@dataclass(frozen=True)
class DetectorOutput:
    modality: str
    layer_scores: dict[str, float]
    watermark_signals: dict[str, Any]
    layer_breakdown: list[dict[str, Any]]
    detected_sources: list[str]
    artifacts: dict[str, Any]
    explanation_parts: list[str]


def clamp(value: float, low: float = 0.0, high: float = 1.0) -> float:
    return max(low, min(high, value))


def round_score(value: float) -> float:
    return round(clamp(value), 3)


def stable_unit(seed: bytes | str, salt: str) -> float:
    if isinstance(seed, str):
        seed = seed.encode("utf-8", errors="ignore")
    digest = hashlib.sha256(seed[:16384] + salt.encode("utf-8")).digest()
    return int.from_bytes(digest[:8], "big") / float(2**64 - 1)


def byte_entropy(data: bytes) -> float:
    if not data:
        return 0.0
    sample = data[: min(len(data), 262_144)]
    counts = [0] * 256
    for byte in sample:
        counts[byte] += 1
    entropy = 0.0
    total = len(sample)
    for count in counts:
        if count:
            probability = count / total
            entropy -= probability * math.log2(probability)
    return entropy / 8.0


def likely_sources(*scores: tuple[str, float]) -> list[str]:
    selected = [name for name, score in scores if score >= 0.58]
    return selected[:3] or ["No specific generator identified"]


class ImageDemoDetector:
    allowed_extensions = {".jpg", ".jpeg", ".png", ".webp", ".heic"}

    def analyze(self, data: bytes, filename: str) -> DetectorOutput:
        name = filename.lower()
        entropy = byte_entropy(data)
        size_factor = clamp(len(data) / (6 * 1024 * 1024))
        filename_ai_hint = 1.0 if re.search(r"(midjourney|stable|diffusion|dall|flux|firefly|gemini|generated|ai)", name) else 0.0
        has_exif = b"Exif" in data[:65536] or b"xmp" in data[:65536].lower()
        has_c2pa = b"c2pa" in data.lower()[:262144] or b"content credentials" in data.lower()[:262144]
        jpeg_blocks = data.count(b"\xff\xd8") + data.count(b"\xff\xdb") + data.count(b"\xff\xc4")

        neural = 0.34 + stable_unit(data, "image-neural") * 0.45 + filename_ai_hint * 0.33
        frequency = 0.22 + abs(entropy - 0.72) * 0.9 + stable_unit(data, "image-frequency") * 0.18 + filename_ai_hint * 0.08
        forensic = 0.18 + (0.16 if not has_exif else -0.08) + size_factor * 0.08 + stable_unit(data, "image-forensic") * 0.34 + filename_ai_hint * 0.08
        provenance = 0.08 + filename_ai_hint * 0.78 + (0.08 if has_c2pa else 0.0)
        watermark = 0.1 + (0.36 if b"synthid" in data.lower()[:262144] else 0.0) + filename_ai_hint * 0.14

        layer_scores = {
            "watermark": round_score(watermark),
            "forensic": round_score(forensic),
            "neural_classifier": round_score(neural),
            "frequency_domain": round_score(frequency),
            "provenance": round_score(provenance),
        }

        heatmap = [
            {
                "x": x,
                "y": y,
                "score": round_score(0.22 + stable_unit(data, f"heatmap-{x}-{y}") * 0.68),
            }
            for y in range(6)
            for x in range(8)
        ]

        if filename_ai_hint or has_c2pa:
            detected_sources = likely_sources(
                ("Midjourney-style image", layer_scores["neural_classifier"]),
                ("Stable Diffusion / Flux-style image", layer_scores["frequency_domain"]),
                ("C2PA-attributed AI image", 0.72 if has_c2pa and filename_ai_hint else 0.0),
            )
        else:
            detected_sources = ["No specific generator identified"]

        explanation_parts = [
            "Image analysis used deterministic MVP heuristics for metadata, byte distribution, filename hints, and pseudo-neural scoring.",
            "No real SynthID, C2PA verification, or AIDE model inference is integrated in this build.",
        ]
        if not has_exif:
            explanation_parts.append("No EXIF/XMP camera metadata was found in the inspected byte range, which is treated as weak synthetic-media evidence.")
        if filename_ai_hint:
            explanation_parts.append("The filename contains AI-generator wording, which increases provenance suspicion in this demo mode.")

        return DetectorOutput(
            modality="IMAGE",
            layer_scores=layer_scores,
            watermark_signals={
                "synthid": {"detected": False, "score": layer_scores["watermark"], "status": "demo_not_integrated"},
                "c2pa": {"present": has_c2pa, "valid": None, "status": "demo_metadata_scan"},
            },
            layer_breakdown=[
                {"name": "Watermark", "score": layer_scores["watermark"], "explanation": "Demo scan for watermark-like byte markers only."},
                {"name": "Forensic", "score": layer_scores["forensic"], "explanation": "Metadata presence, size, and byte-distribution heuristics."},
                {"name": "Neural Classifier", "score": layer_scores["neural_classifier"], "explanation": "Deterministic pseudo-neural score for UI/API validation."},
                {"name": "Frequency Domain", "score": layer_scores["frequency_domain"], "explanation": "Entropy-derived stand-in for FFT/DCT anomaly scoring."},
                {"name": "Provenance", "score": layer_scores["provenance"], "explanation": "Filename and demo C2PA marker checks."},
            ],
            detected_sources=detected_sources,
            artifacts={
                "heatmap": heatmap,
                "metadata": {"has_exif_or_xmp": has_exif, "jpeg_marker_count": jpeg_blocks, "byte_entropy": round(entropy, 3)},
            },
            explanation_parts=explanation_parts,
        )


class VideoDemoDetector:
    allowed_extensions = {".mp4", ".mov", ".avi", ".webm"}

    def analyze(self, data: bytes, filename: str) -> DetectorOutput:
        name = filename.lower()
        entropy = byte_entropy(data)
        size_mb = len(data) / (1024 * 1024)
        filename_ai_hint = 1.0 if re.search(r"(sora|veo|runway|kling|deepfake|generated|ai)", name) else 0.0
        has_mp4_metadata = any(marker in data[:262144].lower() for marker in [b"moov", b"mvhd", b"udta"])

        temporal = 0.26 + stable_unit(data, "video-temporal") * 0.45 + filename_ai_hint * 0.18
        face_mesh = 0.24 + stable_unit(data, "video-face") * 0.42 + filename_ai_hint * 0.14
        neural = 0.3 + stable_unit(data, "video-neural") * 0.42 + clamp(size_mb / 200) * 0.06
        provenance = 0.1 + filename_ai_hint * 0.45 + (0.07 if not has_mp4_metadata else 0.0)
        watermark = 0.08 + (0.34 if b"synthid" in data.lower()[:262144] or b"videoseal" in data.lower()[:262144] else 0.0)

        layer_scores = {
            "watermark": round_score(watermark),
            "temporal_forensics": round_score(temporal),
            "face_mesh": round_score(face_mesh),
            "neural_classifier": round_score(neural),
            "provenance": round_score(provenance),
        }

        segments = []
        for index in range(8):
            start = index * 5
            score = round_score(0.2 + stable_unit(data, f"video-segment-{index}") * 0.68)
            segments.append({"start_seconds": start, "end_seconds": start + 5, "score": score})

        detected_sources = likely_sources(
            ("Runway/Kling-style generated video", layer_scores["temporal_forensics"]),
            ("Sora/Veo-style generated video", layer_scores["neural_classifier"]),
            ("Face-swap/deepfake-style edit", layer_scores["face_mesh"]),
        )

        return DetectorOutput(
            modality="VIDEO",
            layer_scores=layer_scores,
            watermark_signals={
                "synthid_video": {"detected": False, "score": layer_scores["watermark"], "status": "demo_not_integrated"},
                "video_seal": {"detected": False, "score": layer_scores["watermark"], "status": "demo_not_integrated"},
                "c2pa": {"present": False, "valid": None, "status": "demo_not_integrated"},
            },
            layer_breakdown=[
                {"name": "Watermark", "score": layer_scores["watermark"], "explanation": "Demo marker scan for SynthID/VideoSeal-like strings."},
                {"name": "Temporal Forensics", "score": layer_scores["temporal_forensics"], "explanation": "Deterministic stand-in for optical-flow and coherence analysis."},
                {"name": "Face Mesh", "score": layer_scores["face_mesh"], "explanation": "Pseudo-score for face geometry and lip-sync inconsistency checks."},
                {"name": "Neural Classifier", "score": layer_scores["neural_classifier"], "explanation": "Deterministic pseudo-neural score for video generator coverage."},
                {"name": "Provenance", "score": layer_scores["provenance"], "explanation": "Container marker and filename provenance heuristics."},
            ],
            detected_sources=detected_sources,
            artifacts={
                "timeline": segments,
                "metadata": {"size_mb": round(size_mb, 2), "byte_entropy": round(entropy, 3), "has_mp4_metadata": has_mp4_metadata},
            },
            explanation_parts=[
                "Video analysis used deterministic MVP heuristics for byte patterns, container markers, filename hints, and timeline scoring.",
                "Real frame extraction, MediaPipe face mesh, optical flow, VideoSeal, and deepfake model inference are deferred.",
            ],
        )


class TextHeuristicDetector:
    allowed_extensions = {".txt", ".md", ".docx", ".pdf"}
    ai_phrases = {
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
        "as an ai",
    }

    def analyze(self, text: str, filename: str | None = None) -> DetectorOutput:
        normalized = re.sub(r"\s+", " ", text.strip())
        sentences = [sentence.strip() for sentence in re.split(r"(?<=[.!?])\s+", normalized) if sentence.strip()]
        words = re.findall(r"[A-Za-z][A-Za-z'-]*", normalized.lower())
        word_count = len(words)
        unique_ratio = len(set(words)) / max(word_count, 1)
        sentence_lengths = [len(re.findall(r"[A-Za-z][A-Za-z'-]*", sentence)) for sentence in sentences] or [word_count]
        avg_sentence = statistics.mean(sentence_lengths)
        burstiness = statistics.pstdev(sentence_lengths) / max(avg_sentence, 1)
        phrase_hits = sum(normalized.lower().count(phrase) for phrase in self.ai_phrases)
        phrase_density = phrase_hits / max(len(sentences), 1)
        punctuation_uniformity = 1.0 - clamp(len(set(sentence[-1] for sentence in sentences if sentence)) / 4)

        burstiness_reliability = clamp((len(sentences) - 2) / 3)
        low_burstiness_signal = clamp(1.0 - burstiness) * burstiness_reliability
        polished_length_signal = clamp((avg_sentence - 12) / 18)
        lexical_signal = clamp((0.62 - unique_ratio) * 2.2)
        phrase_signal = clamp(phrase_density / 0.6)
        first_person_count = sum(1 for word in words if word in {"i", "me", "my", "mine", "we", "our", "ours"})
        human_context_signal = clamp((first_person_count / max(word_count, 1)) * 12 + clamp(unique_ratio - 0.72) * 1.5)

        linguistic = 0.2 + low_burstiness_signal * 0.22 + polished_length_signal * 0.18 + phrase_signal * 0.42
        if phrase_hits == 0:
            linguistic -= human_context_signal * 0.2
        neural = 0.26 + stable_unit(normalized, "text-neural") * 0.12 + linguistic * 0.58 + phrase_signal * 0.08
        if phrase_hits == 0:
            neural -= human_context_signal * 0.14
        provenance = 0.08 + (0.12 if filename and Path(filename).suffix.lower() in {".docx", ".pdf"} else 0.0)
        watermark = 0.08 + (0.32 if "synthid" in normalized.lower() else 0.0)

        layer_scores = {
            "watermark": round_score(watermark),
            "linguistic": round_score(linguistic),
            "neural_classifier": round_score(neural),
            "provenance": round_score(provenance),
        }

        sentence_artifacts = []
        for index, sentence in enumerate(sentences[:80]):
            length = max(len(re.findall(r"[A-Za-z][A-Za-z'-]*", sentence)), 1)
            phrase_bonus = 0.2 if any(phrase in sentence.lower() for phrase in self.ai_phrases) else 0.0
            score = round_score(0.18 + clamp((length - 10) / 28) * 0.28 + phrase_bonus + stable_unit(sentence, "sentence") * 0.26)
            sentence_artifacts.append({"index": index, "text": sentence, "score": score})

        detected_sources = likely_sources(
            ("General LLM-style prose", layer_scores["linguistic"]),
            ("GPT-style assistant prose", phrase_signal),
            ("Gemini/SynthID text candidate", layer_scores["watermark"]),
        )

        explanation_parts = [
            "Text analysis used deterministic MVP heuristics for sentence rhythm, burstiness, lexical variety, phrase signatures, and pseudo-neural scoring.",
            "Real SynthID text detection and transformer classifiers are not integrated in this build.",
        ]
        if phrase_hits:
            explanation_parts.append("Repeated assistant-style transition phrases increased the AI-likelihood score.")
        if low_burstiness_signal > 0.65:
            explanation_parts.append("Sentence lengths are unusually uniform, a weak signal often associated with model-generated text.")

        return DetectorOutput(
            modality="TEXT",
            layer_scores=layer_scores,
            watermark_signals={
                "synthid_text": {"detected": "synthid" in normalized.lower(), "score": layer_scores["watermark"], "status": "demo_marker_scan"},
            },
            layer_breakdown=[
                {"name": "Watermark", "score": layer_scores["watermark"], "explanation": "Demo marker scan for SynthID-like wording only."},
                {"name": "Linguistic", "score": layer_scores["linguistic"], "explanation": "Burstiness, sentence rhythm, lexical variety, and phrase-density heuristics."},
                {"name": "Neural Classifier", "score": layer_scores["neural_classifier"], "explanation": "Deterministic pseudo-neural score for API and UI validation."},
                {"name": "Provenance", "score": layer_scores["provenance"], "explanation": "Document-source context only; no text provenance standard is verified."},
            ],
            detected_sources=detected_sources,
            artifacts={
                "sentences": sentence_artifacts,
                "metrics": {
                    "word_count": word_count,
                    "sentence_count": len(sentences),
                    "lexical_diversity": round(unique_ratio, 3),
                    "burstiness": round(burstiness, 3),
                    "phrase_hits": phrase_hits,
                    "punctuation_uniformity": round(punctuation_uniformity, 3),
                    "human_context": round(human_context_signal, 3),
                },
            },
            explanation_parts=explanation_parts,
        )
