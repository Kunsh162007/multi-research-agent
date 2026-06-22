"""
Self-RAG decision nodes:
  decide_retrieval — should we fetch more information?
  grade_relevance  — which retrieved docs are worth keeping?
  grade_answer     — is the current draft good enough?
"""

import json
import logging
from src.llm import get_llm, get_fast_llm
from src.state import ResearchState

logger = logging.getLogger(__name__)

# ─── Prompts ───────────────────────────────────────────────────────────────────

_DECIDE_RETRIEVAL = """You are a retrieval-decision agent for an agentic researcher.

Query        : {query}
Clarified    : {clarified_query}
Angles       : {angles}
Iteration    : {iteration}
Findings so far: {num_findings} accepted documents
Draft preview: {draft_preview}

Decide whether external retrieval is needed to improve the answer.
Return ONLY valid JSON — no markdown, no extra text:
{{"needs_retrieval": true or false, "reason": "one-sentence explanation"}}"""

_GRADE_RELEVANCE = """You are a relevance-grading agent. Grade each document as RELEVANT, PARTIAL, or NOT.

Research query : {query}
Angles to cover: {angles}

Documents:
{docs}

Return ONLY valid JSON:
{{"grades": [{{"index": 0, "grade": "RELEVANT", "reason": "..."}}]}}"""

_GRADE_ANSWER = """You are an answer-quality grader.

Query  : {query}
Angles : {angles}
Sources: {num_findings} documents
Draft  :
{draft}

Score 0-100 on:
- supported  : claims backed by cited findings
- complete   : all research angles addressed
- overall    : combined quality

Return ONLY valid JSON:
{{"supported": 0-100, "complete": 0-100, "overall": 0-100, "feedback": "..."}}"""


# ─── Helpers ───────────────────────────────────────────────────────────────────

def _parse_json(text: str) -> dict:
    """Strip markdown fences and parse JSON."""
    text = text.strip()
    if text.startswith("```"):
        parts = text.split("```")
        text = parts[1] if len(parts) > 1 else text
        if text.startswith("json"):
            text = text[4:]
    return json.loads(text.strip())


def _llm_json(prompt: str, fallback: dict) -> dict:
    llm = get_fast_llm(temperature=0.1)
    for attempt in range(2):
        extra = "" if attempt == 0 else "\n\nCRITICAL: Return ONLY valid JSON, nothing else."
        try:
            response = llm.invoke(prompt + extra)
            return _parse_json(response.content)
        except Exception as e:
            logger.warning(f"JSON parse attempt {attempt + 1} failed: {e}")
    logger.error("Both JSON attempts failed — using fallback")
    return fallback


# ─── Node functions ────────────────────────────────────────────────────────────

def decide_retrieval(state: ResearchState) -> dict:
    draft_preview = (state.get("draft_answer") or "")[:300] or "(none yet)"
    result = _llm_json(
        _DECIDE_RETRIEVAL.format(
            query=state["query"],
            clarified_query=state.get("clarified_query", state["query"]),
            angles=state.get("research_angles", []),
            iteration=state.get("iteration", 0),
            num_findings=len(state.get("findings", [])),
            draft_preview=draft_preview,
        ),
        fallback={"needs_retrieval": True, "reason": "fallback — assuming retrieval needed"},
    )
    return {"needs_retrieval": bool(result.get("needs_retrieval", True))}


def grade_relevance(state: ResearchState) -> dict:
    docs = state.get("retrieved_docs", [])
    if not docs:
        return {"findings": state.get("findings", []), "retrieved_docs": []}

    docs_text = "\n".join(
        f"[{i}] SOURCE: {d.get('source', '?')}\n    TEXT: {d.get('text', '')[:300]}"
        for i, d in enumerate(docs)
    )
    result = _llm_json(
        _GRADE_RELEVANCE.format(
            query=state.get("clarified_query", state["query"]),
            angles=state.get("research_angles", []),
            docs=docs_text,
        ),
        fallback={"grades": [{"index": i, "grade": "PARTIAL", "reason": "fallback"} for i in range(len(docs))]},
    )

    from src.credibility import score_finding, summarize_credibility

    existing = list(state.get("findings", []))
    for item in result.get("grades", []):
        idx = item.get("index", 0)
        if item.get("grade") in ("RELEVANT", "PARTIAL") and idx < len(docs):
            doc = dict(docs[idx])
            doc["citation_index"] = len(existing) + 1
            doc["grade"] = item["grade"]
            doc["credibility"] = score_finding(doc)
            existing.append(doc)

    return {
        "findings": existing,
        "retrieved_docs": [],
        "credibility": summarize_credibility(existing),
    }


def grade_answer(state: ResearchState) -> dict:
    result = _llm_json(
        _GRADE_ANSWER.format(
            query=state.get("clarified_query", state["query"]),
            angles=state.get("research_angles", []),
            num_findings=len(state.get("findings", [])),
            draft=state.get("draft_answer", "(no draft yet)"),
        ),
        fallback={"supported": 50, "complete": 50, "overall": 50, "feedback": "fallback"},
    )
    # Increment iteration here so the route function sees the updated count.
    iteration = state.get("iteration", 0) + 1
    return {"answer_quality": result, "iteration": iteration}
