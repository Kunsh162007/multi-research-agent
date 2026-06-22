"""
Deterministic tests for the Knowledge Mentor upgrade (router, credibility,
deep-search shape, verify node, multimodal data files, export segmentation).
No network or live LLM calls.
"""
import json
import os
import pytest


# ─── Router roles ────────────────────────────────────────────────────────────────

def test_router_roles_resolve_to_groq_without_gemini(monkeypatch):
    from src import router
    # Force "no Gemini key" regardless of the ambient .env.
    monkeypatch.setattr(router, "GEMINI_API_KEY", None)
    # Without GEMINI_API_KEY, every role falls back to a Groq chat model.
    for role in ("fast", "heavy", "reason", "vision", "long"):
        m = router.get_model(role)
        assert type(m).__name__ == "ChatGroq"


def test_router_unknown_role_defaults_heavy():
    from src import router
    assert type(router.get_model("nonsense")).__name__ == "ChatGroq"


# ─── Credibility scoring ─────────────────────────────────────────────────────────

def test_credibility_academic_beats_stub():
    from src.credibility import score_finding, summarize_credibility
    arxiv = score_finding({"url": "https://arxiv.org/abs/2401.1", "text": "x", "published": "2024"})
    stub = score_finding({"url": "https://example.com/stub/1", "text": "[STUB RESULT 1]"})
    assert arxiv["score"] > 0.7
    assert stub["score"] <= 0.2
    summ = summarize_credibility([
        {"credibility": arxiv}, {"credibility": stub},
    ])
    assert summ["count"] == 2 and 0.0 <= summ["avg"] <= 1.0


# ─── Verify node (deterministic citation check) ──────────────────────────────────

def test_verify_flags_dangling_citations():
    from src.nodes import verify
    state = {
        "findings": [{"citation_index": 1}, {"citation_index": 2}],
        "draft_answer": "Claim one [1]. Claim two [2]. Bogus [9].",
        "research_angles": ["a"],
    }
    check = verify(state)["citation_check"]
    assert check["invalid"] == [9]
    assert check["all_supported"] is False


# ─── Deep search / SearXNG ───────────────────────────────────────────────────────

def test_searxng_returns_empty_without_url(monkeypatch):
    from src import tools
    # Force "no SEARXNG_URL" regardless of the ambient .env.
    monkeypatch.setattr(tools, "SEARXNG_URL", "")
    assert tools.searxng_search("anything") == []
    assert "searxng_search" in tools.TOOL_REGISTRY
    assert "deep_crawl" in tools.TOOL_REGISTRY


# ─── Multimodal file processor (data files, no network) ──────────────────────────

def test_process_csv_and_json():
    pd = pytest.importorskip("pandas")
    from src.file_processor import process_file, SUPPORTED_EXTS
    assert {".png", ".mp3", ".csv", ".pdf"} <= SUPPORTED_EXTS
    csv_docs = process_file(b"a,b\n1,2\n3,4\n", "data.csv")
    assert csv_docs and "Data file" in csv_docs[0]["text"]
    json_docs = process_file(json.dumps([{"x": 1}]).encode(), "d.json")
    assert json_docs


def test_unsupported_extension_rejected():
    from src.file_processor import process_file
    with pytest.raises(ValueError):
        process_file(b"x", "file.xyz")


# ─── Export segmentation (mermaid splitting) ─────────────────────────────────────

def test_split_mermaid_segments():
    from src.export_report import _split_mermaid
    report = "# T\n\nIntro.\n\n```mermaid\nflowchart TD\nA-->B\n```\n\nOutro."
    segs = list(_split_mermaid(report))
    kinds = [k for k, _ in segs]
    assert "mermaid" in kinds and kinds.count("text") == 2
