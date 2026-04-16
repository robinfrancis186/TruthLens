from __future__ import annotations

from io import BytesIO
from pathlib import Path

from fastapi import HTTPException


def parse_text_upload(data: bytes, filename: str) -> str:
    suffix = Path(filename).suffix.lower()
    if suffix in {".txt", ".md"}:
        return data.decode("utf-8", errors="replace")
    if suffix == ".docx":
        try:
            from docx import Document
        except ImportError as exc:
            raise HTTPException(status_code=422, detail="DOCX parsing dependency is not installed.") from exc
        document = Document(BytesIO(data))
        return "\n".join(paragraph.text for paragraph in document.paragraphs).strip()
    if suffix == ".pdf":
        try:
            from pypdf import PdfReader
        except ImportError as exc:
            raise HTTPException(status_code=422, detail="PDF parsing dependency is not installed.") from exc
        reader = PdfReader(BytesIO(data))
        return "\n".join(page.extract_text() or "" for page in reader.pages).strip()
    raise HTTPException(status_code=415, detail="Unsupported text upload type. Use .txt, .md, .docx, or .pdf.")

