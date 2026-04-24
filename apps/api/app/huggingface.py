from __future__ import annotations

import json
import re
import urllib.error
import urllib.request
from typing import Any

from app.config import Settings
from app.detectors import DetectorOutput, round_score


TIMEOUT_SECONDS = 8


def _flatten_response(body: Any) -> list[dict[str, Any]]:
    value = body[0] if isinstance(body, list) and body and isinstance(body[0], list) else body
    if not isinstance(value, list):
        return []
    labels = [
        entry
        for entry in value
        if isinstance(entry, dict) and isinstance(entry.get("label"), str) and isinstance(entry.get("score"), (int, float))
    ]
    return sorted(labels, key=lambda entry: float(entry["score"]), reverse=True)


def _normalized_label(label: str) -> str:
    return re.sub(r"[_-]+", " ", label.lower()).strip()


def _is_ai_label(label: str) -> bool:
    normalized = _normalized_label(label)
    if re.fullmatch(r"(label 1|ai|artificial|fake|generated|synthetic|machine)", normalized):
        return True
    if re.search(r"(not ai|not generated|non ai|human|real|authentic|original)", normalized):
        return False
    return bool(re.search(r"(ai|generated|machine|synthetic|fake|artificial)", normalized))


def _is_human_label(label: str) -> bool:
    normalized = _normalized_label(label)
    if re.fullmatch(r"(label 0|human|real|authentic|original)", normalized):
        return True
    return bool(re.search(r"(not ai|not generated|non ai|human|real|authentic|original)", normalized))


def _ai_score_from_labels(labels: list[dict[str, Any]]) -> tuple[str, float] | None:
    ai_label = next((entry for entry in labels if _is_ai_label(str(entry["label"]))), None)
    if ai_label:
        return str(ai_label["label"]), round_score(float(ai_label["score"]))
    human_label = next((entry for entry in labels if _is_human_label(str(entry["label"]))), None)
    if human_label:
        return str(human_label["label"]), round_score(1.0 - float(human_label["score"]))
    return None


def _classify_with_huggingface(input_data: str | bytes, model: str, settings: Settings) -> tuple[str, float]:
    if not settings.hf_token:
        raise RuntimeError("HF_TOKEN is not configured.")

    is_bytes = isinstance(input_data, bytes)
    payload = input_data if is_bytes else json.dumps({"inputs": input_data, "parameters": {"top_k": 2}}).encode("utf-8")
    request = urllib.request.Request(
        f"{settings.hf_inference_endpoint_base.rstrip('/')}/{model}",
        data=payload,
        headers={
            "Authorization": f"Bearer {settings.hf_token}",
            "Content-Type": "application/octet-stream" if is_bytes else "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=TIMEOUT_SECONDS) as response:
            labels = _flatten_response(json.loads(response.read().decode("utf-8")))
    except urllib.error.HTTPError as caught:
        raise RuntimeError(f"HF inference returned {caught.code}.") from caught

    mapped = _ai_score_from_labels(labels)
    if mapped is None:
        raise RuntimeError("HF inference returned no mappable AI/human label.")
    return mapped


def _classify_with_fallbacks(input_data: str | bytes, models: list[str], settings: Settings) -> tuple[str, str, float, list[dict[str, Any]]]:
    attempts: list[dict[str, Any]] = []
    for model in dict.fromkeys(models):
        try:
            label, score = _classify_with_huggingface(input_data, model, settings)
            attempts.append({"model": model, "status": "ok", "label": label, "score": score})
            return model, label, score, attempts
        except Exception as caught:
            attempts.append({"model": model, "status": "error", "error": str(caught)[:180]})
    raise RuntimeError(json.dumps({"message": "All HF model attempts failed.", "attempts": attempts}))


def _metadata(output: DetectorOutput) -> dict[str, Any]:
    metadata = output.artifacts.get("metadata")
    if isinstance(metadata, dict):
        return metadata
    output.artifacts["metadata"] = {}
    return output.artifacts["metadata"]


def _apply_hf_score(output: DetectorOutput, model: str, label: str, score: float, explanation: str) -> None:
    output.layer_scores["neural_classifier"] = score
    for layer in output.layer_breakdown:
        if layer.get("name") == "Neural Classifier":
            layer["score"] = score
            layer["explanation"] = explanation
    metadata = _metadata(output)
    metadata.update({"hf_model": model, "hf_label": label, "hf_score": score, "hf_status": "ok", "calibration_version": "hf-model-primary-v1"})


def _apply_hf_error(output: DetectorOutput, model: str, caught: Exception) -> None:
    metadata = _metadata(output)
    error = str(caught)[:180]
    attempts: Any = None
    try:
        attempts = json.loads(str(caught)).get("attempts")
    except Exception:
        attempts = [{"model": model, "status": "error", "error": error}]
    metadata.update({"hf_model": model, "hf_status": "fallback", "hf_error": error, "model_attempts": attempts, "calibration_version": "hf-model-primary-v1"})


def enrich_with_huggingface(output: DetectorOutput, settings: Settings, *, text: str | None = None, image: bytes | None = None) -> DetectorOutput:
    if not settings.hf_token:
        _metadata(output).update({"hf_status": "disabled"})
        return output

    if output.modality == "TEXT" and text:
        model = settings.hf_text_model_list[0]
        try:
            model, label, score, attempts = _classify_with_fallbacks(text, settings.hf_text_model_list, settings)
            _apply_hf_score(output, model, label, score, "Hugging Face Desklib AI text detector probability, with heuristic fallback available.")
            _metadata(output)["model_attempts"] = attempts
            output.explanation_parts.append("The neural classifier layer used Hugging Face Desklib AI text detector inference.")
        except Exception as caught:
            _apply_hf_error(output, model, caught)

    if output.modality == "IMAGE" and image:
        model = settings.hf_image_model_list[0]
        try:
            model, label, score, attempts = _classify_with_fallbacks(image, settings.hf_image_model_list, settings)
            _apply_hf_score(output, model, label, score, "Hugging Face AI image detector probability mapped from artificial-vs-real labels.")
            _metadata(output)["model_attempts"] = attempts
            output.explanation_parts.append("The neural classifier layer used Hugging Face AI image detector inference.")
            if score >= 0.58 and not any("Hugging Face" in source for source in output.detected_sources):
                output.detected_sources[:] = ["Hugging Face AI image detector", *output.detected_sources][:3]
        except Exception as caught:
            _apply_hf_error(output, model, caught)

    return output
