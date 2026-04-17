from __future__ import annotations

from io import BytesIO
from pathlib import Path

from fastapi import HTTPException


def normalize_extracted_text(value: str) -> str:
    normalized = value.replace("\r\n", "\n").replace("\r", "\n").replace("\x00", "")
    normalized = "".join(" " if ord(character) < 32 and character not in "\n\t" else character for character in normalized)
    return "\n".join(line.strip() for line in normalized.splitlines()).strip()


def assert_readable_text(text: str, filename: str) -> None:
    visible_chars = "".join(character for character in text if not character.isspace())
    replacement_chars = text.count("\ufffd")
    readable_chars = sum(character.isalnum() or ord(character) >= 160 for character in visible_chars)
    readable_ratio = readable_chars / len(visible_chars) if visible_chars else 0
    replacement_ratio = replacement_chars / len(visible_chars) if visible_chars else 0
    if len(visible_chars) < 8 or readable_ratio < 0.35 or replacement_ratio > 0.02:
        raise HTTPException(status_code=422, detail=f"Could not extract readable text from {filename}. Try a selectable-text PDF, DOCX, TXT, or MD file.")


def parse_text_upload(data: bytes, filename: str) -> str:
    suffix = Path(filename).suffix.lower()
    if suffix in {".txt", ".md"}:
        content = data.decode("utf-8", errors="replace")
    elif suffix == ".docx":
        try:
            from docx import Document
        except ImportError as exc:
            raise HTTPException(status_code=422, detail="DOCX parsing dependency is not installed.") from exc
        document = Document(BytesIO(data))
        content = "\n".join(paragraph.text for paragraph in document.paragraphs)
    elif suffix == ".pdf":
        try:
            from pypdf import PdfReader
        except ImportError as exc:
            raise HTTPException(status_code=422, detail="PDF parsing dependency is not installed.") from exc
        reader = PdfReader(BytesIO(data))
        content = "\n".join(page.extract_text() or "" for page in reader.pages)
    else:
        raise HTTPException(status_code=415, detail="Unsupported text upload type. Use .txt, .md, .docx, or .pdf.")

    normalized = normalize_extracted_text(content)
    assert_readable_text(normalized, filename)
    return normalized
