from __future__ import annotations

from typing import Any

from app.detectors import DISCLAIMER, DetectorOutput, clamp, round_score


WEIGHTS: dict[str, dict[str, float]] = {
    "IMAGE": {
        "watermark": 0.18,
        "forensic": 0.2,
        "neural_classifier": 0.28,
        "frequency_domain": 0.22,
        "provenance": 0.12,
    },
    "VIDEO": {
        "watermark": 0.14,
        "temporal_forensics": 0.28,
        "face_mesh": 0.18,
        "neural_classifier": 0.26,
        "provenance": 0.14,
    },
    "TEXT": {
        "watermark": 0.06,
        "linguistic": 0.45,
        "neural_classifier": 0.42,
        "provenance": 0.07,
    },
}


def verdict_for(score: float) -> str:
    if score >= 0.85:
        return "AI_GENERATED"
    if score >= 0.62:
        return "LIKELY_AI"
    if score >= 0.42:
        return "UNCERTAIN"
    if score >= 0.22:
        return "LIKELY_HUMAN"
    return "HUMAN"


def confidence_range(score: float, layer_scores: dict[str, float]) -> list[float]:
    values = list(layer_scores.values()) or [score]
    spread = max(values) - min(values)
    width = clamp(0.06 + spread * 0.12, 0.06, 0.16)
    return [round_score(score - width), round_score(score + width)]


def fuse(output: DetectorOutput, request_id: str, processing_time_ms: int) -> dict[str, Any]:
    weights = WEIGHTS[output.modality]
    total_weight = sum(weights.values())
    score = sum(output.layer_scores.get(name, 0.0) * weight for name, weight in weights.items()) / total_weight
    score = round_score(score)
    explanation = " ".join(output.explanation_parts)
    return {
        "request_id": request_id,
        "verdict": verdict_for(score),
        "confidence": score,
        "confidence_range": confidence_range(score, output.layer_scores),
        "modality": output.modality,
        "detected_sources": output.detected_sources,
        "watermark_signals": output.watermark_signals,
        "layer_scores": output.layer_scores,
        "layer_breakdown": output.layer_breakdown,
        "artifacts": output.artifacts,
        "explanation": explanation,
        "processing_time_ms": processing_time_ms,
        "disclaimer": DISCLAIMER,
    }
