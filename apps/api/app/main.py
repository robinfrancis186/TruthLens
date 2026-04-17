from __future__ import annotations

import time
import uuid
from pathlib import Path
from typing import Annotated

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

from app.cache import TTLResultCache
from app.config import get_settings
from app.detectors import ImageDemoDetector, TextHeuristicDetector, VideoDemoDetector
from app.fusion import fuse
from app.parsers import parse_text_upload


settings = get_settings()
cache = TTLResultCache(ttl_seconds=settings.result_ttl_seconds)
image_detector = ImageDemoDetector()
video_detector = VideoDemoDetector()
text_detector = TextHeuristicDetector()

app = FastAPI(
    title="TruthLens API",
    version="0.1.0",
    description="Runnable MVP API with transparent demo/heuristic multimodal detectors.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list or ["http://localhost:3000"],
    allow_origin_regex=settings.cors_origin_regex or None,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def extension_for(filename: str | None) -> str:
    return Path(filename or "").suffix.lower()


async def read_upload(file: UploadFile) -> bytes:
    data = await file.read()
    if len(data) > settings.max_upload_bytes:
        raise HTTPException(status_code=413, detail=f"File exceeds {settings.max_upload_mb}MB MVP upload limit.")
    if not data:
        raise HTTPException(status_code=422, detail="Uploaded file is empty.")
    return data


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "healthy", "service": "truthlens-api", "mode": "mvp-demo"}


@app.get("/v1/models")
def models() -> dict[str, object]:
    return {
        "mode": "mvp-demo",
        "disclaimer": "Coverage entries describe planned production integrations; current scoring is deterministic demo/heuristic logic.",
        "modalities": [
            {
                "modality": "IMAGE",
                "accepted_types": sorted(ImageDemoDetector.allowed_extensions),
                "planned_integrations": ["SynthID", "C2PA", "AIDE", "CLIP probe", "FFT/DCT forensics"],
            },
            {
                "modality": "VIDEO",
                "accepted_types": sorted(VideoDemoDetector.allowed_extensions),
                "planned_integrations": ["SynthID Video", "VideoSeal", "MediaPipe", "FFmpeg", "FaceForensics++"],
            },
            {
                "modality": "TEXT",
                "accepted_types": sorted(TextHeuristicDetector.allowed_extensions),
                "planned_integrations": ["SynthID Text", "RADAR", "Binoculars", "DeBERTa", "multilingual DistilBERT"],
            },
        ],
    }


@app.post("/v1/analyze")
async def analyze(
    content_type: Annotated[str, Form()],
    file: Annotated[UploadFile | None, File()] = None,
    text: Annotated[str | None, Form()] = None,
    detailed_report: Annotated[bool, Form()] = True,
) -> dict[str, object]:
    del detailed_report
    started = time.perf_counter()
    modality = content_type.strip().lower()
    request_id = str(uuid.uuid4())

    if modality not in {"image", "video", "text"}:
        raise HTTPException(status_code=422, detail="content_type must be one of: image, video, text.")

    if modality == "text":
        if file is not None:
            data = await read_upload(file)
            content = parse_text_upload(data, file.filename or "upload.txt")
            source_name = file.filename
        else:
            content = text or ""
            source_name = None
        if not content.strip():
            raise HTTPException(status_code=422, detail="Text content is empty.")
        output = text_detector.analyze(content, source_name)
    else:
        if file is None:
            raise HTTPException(status_code=422, detail=f"{modality} analysis requires a file upload.")
        data = await read_upload(file)
        filename = file.filename or f"upload.{modality}"
        suffix = extension_for(filename)
        if modality == "image":
            if suffix not in ImageDemoDetector.allowed_extensions:
                raise HTTPException(status_code=415, detail="Unsupported image type. Use JPG, PNG, WebP, or HEIC.")
            output = image_detector.analyze(data, filename)
        else:
            if suffix not in VideoDemoDetector.allowed_extensions:
                raise HTTPException(status_code=415, detail="Unsupported video type. Use MP4, MOV, AVI, or WebM.")
            output = video_detector.analyze(data, filename)

    elapsed_ms = max(1, int((time.perf_counter() - started) * 1000))
    result = fuse(output, request_id=request_id, processing_time_ms=elapsed_ms)
    cache.set(request_id, result)
    return result


@app.get("/v1/status/{request_id}")
def status(request_id: str) -> dict[str, object]:
    result = cache.get(request_id)
    if result is None:
        raise HTTPException(status_code=404, detail="Result not found or expired.")
    return {"request_id": request_id, "status": "completed", "result": result}
