"""File processor: parse uploaded PDF/DOCX/TXT files into retrievable text chunks."""

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


_PARSERS = {
    ".pdf": _parse_pdf,
    ".docx": _parse_docx,
    ".doc": _parse_docx,
    ".txt": _parse_txt,
    ".md": _parse_txt,
    ".rst": _parse_txt,
}


def process_file(content: bytes, filename: str) -> List[Dict[str, Any]]:
    """Parse a file and return text chunks as retrieval-ready dicts."""
    ext = os.path.splitext(filename)[1].lower()
    parser = _PARSERS.get(ext)
    if not parser:
        supported = ", ".join(_PARSERS)
        raise ValueError(f"Unsupported file type '{ext}'. Supported: {supported}")

    try:
        text = parser(content)
    except RuntimeError:
        raise
    except Exception as e:
        raise RuntimeError(f"Failed to parse {filename}: {e}")

    return [
        {"text": chunk, "source": filename, "url": "", "relevance": 1.0}
        for chunk in _chunk_text(text)
    ]
