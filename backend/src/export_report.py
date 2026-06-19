"""
Export research reports in multiple formats:
  - Markdown (.md)   — raw report text, ready for Obsidian / GitHub / Notion
  - PDF (.pdf)       — clean typeset document via fpdf2
  - BibTeX (.bib)    — citation entries extracted from arXiv findings
"""

import re
import logging
from typing import Optional

logger = logging.getLogger(__name__)


# ─── Markdown ──────────────────────────────────────────────────────────────────

def to_markdown(title: str, query: str, report: str) -> bytes:
    header = f"# {title}\n\n**Research Query:** {query}\n\n---\n\n"
    return (header + report).encode("utf-8")


# ─── PDF ───────────────────────────────────────────────────────────────────────

def _strip_markdown(text: str) -> str:
    """Minimal markdown stripping for PDF rendering."""
    text = re.sub(r'^#{1,6}\s+', '', text, flags=re.MULTILINE)
    text = re.sub(r'\*{1,2}([^*\n]+)\*{1,2}', r'\1', text)
    text = re.sub(r'_{1,2}([^_\n]+)_{1,2}', r'\1', text)
    text = re.sub(r'`([^`]+)`', r'\1', text)
    text = re.sub(r'\[([^\]]+)\]\([^\)]+\)', r'\1', text)
    text = re.sub(r'^[-*_]{3,}$', '', text, flags=re.MULTILINE)
    return text.strip()


def to_pdf(title: str, query: str, report: str) -> Optional[bytes]:
    try:
        from fpdf import FPDF

        pdf = FPDF()
        pdf.set_auto_page_break(auto=True, margin=15)
        pdf.add_page()

        # Title
        pdf.set_font("Helvetica", "B", 18)
        pdf.multi_cell(0, 10, txt=title[:100], align="L")
        pdf.ln(2)

        # Query
        pdf.set_font("Helvetica", "I", 11)
        pdf.set_text_color(100, 100, 100)
        pdf.multi_cell(0, 7, txt=f"Query: {query}", align="L")
        pdf.set_text_color(0, 0, 0)
        pdf.ln(5)

        # Horizontal rule
        pdf.set_draw_color(200, 200, 200)
        pdf.line(10, pdf.get_y(), 200, pdf.get_y())
        pdf.ln(6)

        # Body — split on headings for basic formatting
        pdf.set_font("Helvetica", "", 11)
        lines = _strip_markdown(report).split("\n")
        for line in lines:
            stripped = line.strip()
            if not stripped:
                pdf.ln(4)
                continue
            # Treat lines that were headings (now just bold text)
            pdf.multi_cell(0, 6, txt=stripped, align="L")

        return bytes(pdf.output())
    except ImportError:
        logger.warning("fpdf2 not installed — PDF export unavailable. Run: pip install fpdf2")
        return None
    except Exception as e:
        logger.error(f"PDF generation failed: {e}")
        return None


# ─── BibTeX ────────────────────────────────────────────────────────────────────

def _arxiv_id_from_url(url: str) -> Optional[str]:
    """Extract arXiv ID from a URL like https://arxiv.org/abs/2401.00001."""
    match = re.search(r'arxiv\.org/abs/([^\s/?#]+)', url or "")
    return match.group(1) if match else None


def to_bibtex(findings: list[dict]) -> bytes:
    """
    Generate a .bib file from the findings list.
    Only arXiv sources get proper @article entries; others get @misc.
    """
    entries = []
    seen: set[str] = set()

    for f in findings:
        url = f.get("url", "")
        source = f.get("source", "Unknown Source")
        citation_index = f.get("citation_index", 0)

        arxiv_id = _arxiv_id_from_url(url)
        key = f"ref{citation_index}"
        if key in seen:
            continue
        seen.add(key)

        if arxiv_id:
            # Extract year from arXiv ID (format: YYMM.NNNNN)
            year = "20" + arxiv_id[:2] if len(arxiv_id) >= 2 else "2024"
            # Extract author surnames from source title as best-effort author
            entry = (
                f"@article{{{key},\n"
                f"  title     = {{{source}}},\n"
                f"  year      = {{{year}}},\n"
                f"  url       = {{{url}}},\n"
                f"  note      = {{arXiv:{arxiv_id}}},\n"
                f"  archivePrefix = {{arXiv}},\n"
                f"  eprint    = {{{arxiv_id}}}\n"
                f"}}"
            )
        else:
            entry = (
                f"@misc{{{key},\n"
                f"  title     = {{{source}}},\n"
                f"  url       = {{{url}}},\n"
                f"  year      = {{2025}},\n"
                f"  note      = {{Accessed via Research Assistant}}\n"
                f"}}"
            )

        entries.append(entry)

    bib_content = "\n\n".join(entries) if entries else "% No citable sources found."
    return bib_content.encode("utf-8")
