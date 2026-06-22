"""
Source-credibility scoring — deterministic, no LLM / network calls.

Each finding gets a 0.0–1.0 score from domain reputation, peer-review/DOI signals,
and recency. Used to weight relevance grading and shown on source cards so the user
can judge how trustworthy the evidence is.
"""
import re
from datetime import datetime, timezone
from urllib.parse import urlparse

_ACADEMIC = (
    "arxiv.org", "doi.org", "semanticscholar.org", "ncbi.nlm.nih.gov",
    "aclanthology.org", "ieee.org", "acm.org", "nature.com", "science.org",
    "springer.com", "sciencedirect.com", "pubmed",
)


def score_finding(doc: dict) -> dict:
    """Return {score, domain, signals} for a single finding dict."""
    url = doc.get("url", "") or ""
    text = doc.get("text", "") or ""
    domain = (urlparse(url).hostname or "").replace("www.", "")

    # Stub / no-key placeholders are explicitly untrustworthy.
    if "example.com/stub" in url or text.startswith("[STUB"):
        return {"score": 0.1, "domain": domain or "stub", "signals": ["placeholder/no-key"]}

    score = 0.5
    signals: list[str] = []

    if any(k in url for k in _ACADEMIC):
        score += 0.30
        signals.append("peer-reviewed/academic")
    if domain.endswith((".edu", ".gov", ".ac.uk")):
        score += 0.15
        signals.append("institutional")
    if "github.com" in url:
        score += 0.08
        signals.append("source-code")
    if "wikipedia.org" in url:
        score += 0.05
        signals.append("encyclopedic")
    if not url:
        score -= 0.15
        signals.append("no-url")

    # Recency: prefer a published date, else any 4-digit year in the text.
    year = None
    published = doc.get("published")
    if published:
        m = re.search(r"(19|20)\d{2}", str(published))
        year = int(m.group()) if m else None
    if year is None:
        m = re.search(r"\b(20[0-2]\d)\b", text)
        year = int(m.group()) if m else None
    if year:
        age = datetime.now(timezone.utc).year - year
        if age <= 1:
            score += 0.10; signals.append("recent")
        elif age <= 3:
            score += 0.05
        elif age >= 8:
            score -= 0.05; signals.append("dated")

    score = round(max(0.0, min(1.0, score)), 2)
    return {"score": score, "domain": domain or "web", "signals": signals or ["general-web"]}


def summarize_credibility(findings: list[dict]) -> dict:
    """Aggregate per-finding credibility into a state summary."""
    scored = [f.get("credibility", {}).get("score") for f in findings]
    scored = [s for s in scored if isinstance(s, (int, float))]
    avg = round(sum(scored) / len(scored), 2) if scored else 0.0
    return {
        "avg": avg,
        "count": len(scored),
        "high": sum(1 for s in scored if s >= 0.75),
        "low": sum(1 for s in scored if s < 0.4),
    }
