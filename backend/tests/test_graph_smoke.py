"""
Smoke test: verify the graph builds correctly and node routing logic works
without making any real LLM or network calls.
"""

import json
import pytest
from unittest.mock import MagicMock, patch


def _make_state(**overrides):
    base = {
        "thread_id": "smoke-thread",
        "query": "Smoke test query",
        "user_context": {"audience": "general", "user_id": "smoke-user"},
        "constraints": {"max_iterations": 2, "quality_target": 80},
        "clarified_query": "Smoke test query clarified",
        "research_angles": ["Angle A", "Angle B"],
        "iteration": 0,
        "needs_retrieval": True,
        "retrieved_docs": [],
        "findings": [],
        "draft_answer": "",
        "answer_quality": {},
        "report": "",
        "validation": {},
        "done": False,
        "status": "running",
        "error": None,
    }
    base.update(overrides)
    return base


def test_graph_builds():
    """Graph compiles without error."""
    from src.graph import graph
    assert graph is not None


def test_routing_quality_achieved():
    from src.nodes import route_after_grading
    state = _make_state(
        iteration=1,
        answer_quality={"overall": 85},
        constraints={"max_iterations": 8, "quality_target": 80},
    )
    assert route_after_grading(state) == "synthesize"


def test_routing_max_iterations():
    from src.nodes import route_after_grading
    state = _make_state(
        iteration=8,
        answer_quality={"overall": 50},
        constraints={"max_iterations": 8, "quality_target": 80},
    )
    assert route_after_grading(state) == "synthesize"


def test_routing_continues_loop():
    from src.nodes import route_after_grading
    state = _make_state(
        iteration=2,
        answer_quality={"overall": 60},
        constraints={"max_iterations": 8, "quality_target": 80},
    )
    assert route_after_grading(state) == "decide_retrieval"


def test_tool_registry_contains_all_tools():
    from src.tools import TOOL_REGISTRY
    assert "web_search" in TOOL_REGISTRY
    assert "arxiv_search" in TOOL_REGISTRY
    assert "github_search" in TOOL_REGISTRY
    assert "summarize" in TOOL_REGISTRY


def test_stub_web_search_returns_results():
    """Stub search works without any API key."""
    import os
    with patch.dict(os.environ, {}, clear=False):
        # Ensure TAVILY_API_KEY is absent
        import src.config as cfg
        original = cfg.TAVILY_API_KEY
        cfg.TAVILY_API_KEY = None
        try:
            from src.tools import _stub_search
            results = _stub_search("test query", 3)
            assert len(results) > 0
            assert all("[STUB" in r["text"] for r in results)
        finally:
            cfg.TAVILY_API_KEY = original


def test_streaming_event_format():
    from src.streaming import step_event, token_event, state_event, final_event, error_event

    step = step_event("enhance", "Clarifying query")
    assert step.startswith("data: ")
    data = json.loads(step.replace("data: ", "").strip())
    assert data["type"] == "step"
    assert data["node"] == "enhance"

    tok = token_event("hello")
    data = json.loads(tok.replace("data: ", "").strip())
    assert data["type"] == "token"
    assert data["text"] == "hello"
