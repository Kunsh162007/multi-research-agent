"""
File processor: parse any uploaded data form into retrievable text chunks.

Text docs  : PDF / DOCX / TXT / MD / RST  → extracted text
Images     : PNG / JPG / WEBP / GIF       → vision caption + OCR (router 'vision' tier)
Audio      : MP3 / WAV / M4A / OGG / FLAC → transcript (Groq Whisper)
Data files : CSV / JSON / XLSX            → pandas structural summary

Everything normalizes to the same {text, source, url, relevance} chunk shape the
retrieve/grade nodes already consume, so no graph changes are needed.
"""

import base64
import io
import os
import logging
from typing import List, Dict, Any

logger = logging.getLogger(__name__)

CHUNK_SIZE = 800
CHUNK_OVERLAP = 100


def _chunk_text(text: str) -> List[str]:
    chunks = []
    start = 0
    while start < len(text):
        end = min(start + CHUNK_SIZE, len(text))
        chunks.append(text[start:end].strip())
        start += CHUNK_SIZE - CHUNK_OVERLAP
    return [c for c in chunks if c]


def _parse_pdf(content: bytes) -> str:
    try:
        import fitz
        doc = fitz.open(stream=content, filetype="pdf")
        text = "\n".join(page.get_text() for page in doc)
        doc.close()
        return text
    except ImportError:
        raise RuntimeError("pymupdf not installed — run: pip install pymupdf")
    except Exception as e:
        raise RuntimeError(f"Failed to parse PDF: {e}")


def _parse_docx(content: bytes) -> str:
    try:
        from docx import Document
        doc = Document(io.BytesIO(content))
        return "\n".join(p.text for p in doc.paragraphs if p.text.strip())
    except ImportError:
        raise RuntimeError("python-docx not installed — run: pip install python-docx")
    except Exception as e:
        raise RuntimeError(f"Failed to parse DOCX: {e}")


def _parse_txt(content: bytes) -> str:
    return content.decode("utf-8", errors="replace")


def _parse_image(content: bytes, filename: str) -> str:
    """Caption + OCR an image via the router's vision tier."""
    ext = os.path.splitext(filename)[1].lower().lstrip(".") or "png"
    try:
        from langchain_core.messages import HumanMessage
        from src.router import get_model
        b64 = base64.b64encode(content).decode("ascii")
        msg = HumanMessage(content=[
            {"type": "text", "text": (
                "Describe this image in detail for a research assistant, and transcribe ALL "
                "visible text verbatim (OCR). If it is a chart/diagram, explain what it shows."
            )},
            {"type": "image_url", "image_url": {"url": f"data:image/{ext};base64,{b64}"}},
        ])
        text = get_model("vision", temperature=0.2).invoke([msg]).content
        return f"[Image: {filename}]\n{text}"
    except Exception as e:
        logger.error(f"Image analysis failed for {filename}: {e}")
        raise RuntimeError(f"Image analysis unavailable: {e}")


def _parse_audio(content: bytes, filename: str) -> str:
    from src.router import transcribe_audio
    transcript = transcribe_audio(content, filename)
    if not transcript:
        raise RuntimeError("Audio transcription unavailable or returned empty text.")
    return f"[Audio transcript: {filename}]\n{transcript}"


def _parse_data(content: bytes, filename: str) -> str:
    """Summarize a CSV/JSON/XLSX into a compact textual description."""
    try:
        import pandas as pd
    except ImportError:
        raise RuntimeError("pandas not installed — run: pip install pandas openpyxl")
    ext = os.path.splitext(filename)[1].lower()
    buf = io.BytesIO(content)
    try:
        if ext == ".csv":
            df = pd.read_csv(buf)
        elif ext == ".json":
            df = pd.read_json(buf)
        elif ext in (".xlsx", ".xls"):
            df = pd.read_excel(buf)
        else:
            raise ValueError(ext)
    except Exception as e:
        raise RuntimeError(f"Failed to read data file {filename}: {e}")

    lines = [
        f"[Data file: {filename}]",
        f"Rows: {len(df)} | Columns: {len(df.columns)}",
        "Columns: " + ", ".join(f"{c} ({df[c].dtype})" for c in df.columns),
        "",
        "First rows:",
        df.head(10).to_string(index=False),
    ]
    try:
        lines += ["", "Numeric summary:", df.describe(include="all").to_string()]
    except Exception:
        pass
    return "\n".join(lines)


# ext → (parser, takes_filename)
_PARSERS = {
    ".pdf": _parse_pdf, ".docx": _parse_docx, ".doc": _parse_docx,
    ".txt": _parse_txt, ".md": _parse_txt, ".rst": _parse_txt,
}
_IMAGE_EXTS = {".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp"}
_AUDIO_EXTS = {".mp3", ".wav", ".m4a", ".ogg", ".flac", ".webm"}
_DATA_EXTS  = {".csv", ".json", ".xlsx", ".xls"}

SUPPORTED_EXTS = set(_PARSERS) | _IMAGE_EXTS | _AUDIO_EXTS | _DATA_EXTS


def process_file(content: bytes, filename: str) -> List[Dict[str, Any]]:
    """Parse any supported file and return text chunks as retrieval-ready dicts."""
    ext = os.path.splitext(filename)[1].lower()

    if ext in _PARSERS:
        parse = lambda: _PARSERS[ext](content)
    elif ext in _IMAGE_EXTS:
        parse = lambda: _parse_image(content, filename)
    elif ext in _AUDIO_EXTS:
        parse = lambda: _parse_audio(content, filename)
    elif ext in _DATA_EXTS:
        parse = lambda: _parse_data(content, filename)
    else:
        raise ValueError(f"Unsupported file type '{ext}'. Supported: {', '.join(sorted(SUPPORTED_EXTS))}")

    try:
        text = parse()
    except (RuntimeError, ValueError):
        raise
    except Exception as e:
        raise RuntimeError(f"Failed to parse {filename}: {e}")

    return [
        {"text": chunk, "source": filename, "url": "", "relevance": 1.0}
        for chunk in _chunk_text(text)
    ]
