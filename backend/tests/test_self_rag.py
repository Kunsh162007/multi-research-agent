"""
Self-RAG unit tests with a mocked LLM to avoid API calls.
"""

import json
import pytest
from unittest.mock import MagicMock, patch


def _make_state(**overrides):
    base = {
        "thread_id": "test-thread",
        "query": "What is RAG?",
        "user_context": {"audience": "general", "user_id": "test-user"},
        "constraints": {"max_iterations": 8, "quality_target": 75},
        "clarified_query": "What is retrieval-augmented generation?",
        "research_angles": ["Definition", "Applications", "Limitations"],
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


@patch("src.self_rag.get_llm")
def test_decide_retrieval_true(mock_get_llm):
    mock_llm = MagicMock()
    mock_llm.invoke.return_value = MagicMock(content=json.dumps({"needs_retrieval": True, "reason": "no findings yet"}))
    mock_get_llm.return_value = mock_llm

    from src.self_rag import decide_retrieval
    result = decide_retrieval(_make_state())
    assert result["needs_retrieval"] is True


@patch("src.self_rag.get_llm")
def test_decide_retrieval_false(mock_get_llm):
    mock_llm = MagicMock()
    mock_llm.invoke.return_value = MagicMock(content=json.dumps({"needs_retrieval": False, "reason": "sufficient findings"}))
    mock_get_llm.return_value = mock_llm

    from src.self_rag import decide_retrieval
    result = decide_retrieval(_make_state(iteration=3, findings=[{"citation_index": 1}]))
    assert result["needs_retrieval"] is False


@patch("src.self_rag.get_llm")
def test_grade_relevance_filters(mock_get_llm):
    docs = [
        {"text": "RAG is great", "source": "Paper A", "url": "http://a.com", "relevance": 1.0},
        {"text": "Unrelated topic", "source": "Paper B", "url": "http://b.com", "relevance": 0.1},
    ]
    grades = [
        {"index": 0, "grade": "RELEVANT", "reason": "directly addresses RAG"},
        {"index": 1, "grade": "NOT", "reason": "unrelated"},
    ]
    mock_llm = MagicMock()
    mock_llm.invoke.return_value = MagicMock(content=json.dumps({"grades": grades}))
    mock_get_llm.return_value = mock_llm

    from src.self_rag import grade_relevance
    result = grade_relevance(_make_state(retrieved_docs=docs))
    assert len(result["findings"]) == 1
    assert result["findings"][0]["source"] == "Paper A"
    assert result["retrieved_docs"] == []


@patch("src.self_rag.get_llm")
def test_grade_answer_scores(mock_get_llm):
    quality = {"supported": 80, "complete": 70, "overall": 75, "feedback": "Good"}
    mock_llm = MagicMock()
    mock_llm.invoke.return_value = MagicMock(content=json.dumps(quality))
    mock_get_llm.return_value = mock_llm

    from src.self_rag import grade_answer
    result = grade_answer(_make_state(iteration=1, draft_answer="RAG combines retrieval with generation…"))
    assert result["answer_quality"]["overall"] == 75
    # Iteration is incremented inside grade_answer
    assert result["iteration"] == 2


@patch("src.self_rag.get_llm")
def test_grade_relevance_empty_docs(mock_get_llm):
    from src.self_rag import grade_relevance
    result = grade_relevance(_make_state(retrieved_docs=[]))
    assert result["findings"] == []
    assert result["retrieved_docs"] == []
    mock_get_llm.assert_not_called()
