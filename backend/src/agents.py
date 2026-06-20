"""
Specialized research agents — each optimized for a specific query mode.
Agents run in parallel via ThreadPoolExecutor for maximum throughput.
"""
import logging
from concurrent.futures import ThreadPoolExecutor, as_completed
from src.tools import TOOL_REGISTRY

logger = logging.getLogger(__name__)

# ── Mode auto-detection ────────────────────────────────────────────────────────

_MODE_DETECT = """Classify this research query into ONE mode:
- validate: User wants to know if an idea already exists, check novelty, find prior art, or compare with existing work
- discover: User wants to find the best tools, frameworks, libraries, or products for a task or domain
- explain: User wants to understand, learn, or get a deep explanation of a technology, concept, or algorithm
- research: General in-depth research, surveys, academic analysis, or comparisons

Query: {query}
Reply with ONLY the single mode word (validate, discover, explain, or research):"""


def detect_mode(query: str) -> str:
    """Auto-detect research mode from query using the fast LLM."""
    try:
        from src.llm import get_fast_llm
        response = get_fast_llm(temperature=0.0).invoke(_MODE_DETECT.format(query=query))
        mode = response.content.strip().lower().split()[0]
        return mode if mode in ("validate", "discover", "explain", "research") else "research"
    except Exception:
        return "research"


# ── Mode-specific tool priorities ─────────────────────────────────────────────

MODE_TOOL_PRIORITY: dict[str, list[str]] = {
    "validate": [
        "arxiv_search", "semantic_scholar_search", "crossref_search",
        "web_search", "github_search",
    ],
    "discover": [
        "web_search", "github_search", "arxiv_search", "wikipedia_search",
    ],
    "explain": [
        "wikipedia_search", "arxiv_search", "web_search", "semantic_scholar_search",
    ],
    "research": [
        "web_search", "arxiv_search", "github_search",
        "wikipedia_search", "semantic_scholar_search", "crossref_search",
    ],
}

_MODE_SEARCH_HINTS: dict[str, list[str]] = {
    "validate": [
        "prior art", "existing implementation", "related work", "similar research",
    ],
    "discover": [
        "best tools", "top frameworks", "comparison", "alternatives",
    ],
    "explain": [
        "how it works", "tutorial", "explained", "introduction to",
    ],
    "research": ["", "survey", "analysis", "state of the art"],
}


# ── Mode-specific synthesis prompts ───────────────────────────────────────────

MODE_SYNTHESIS_PROMPTS: dict[str, str] = {
    "validate": """You are an Idea Validation Expert. Analyze whether this idea is novel, what already exists, and what is genuinely new.

Idea / Query: {query}
Research Draft: {draft}
Sources: {sources}

Write a detailed Idea Validation Report:

## Novelty Assessment
Is this idea already implemented or published? Quick answer first.

## Existing Similar Work
All related papers, projects, and implementations found (use inline citations [N]).

## What Is Genuinely Novel
Aspects that are differentiated or not yet explored.

## Current State of the Art
Where the field stands today.

## Opportunities & Gaps
Open problems this idea could address.

## Verdict
Novelty Score (1–10) with reasoning and a clear recommendation.

## References""",

    "discover": """You are a Technology Scout. Find and evaluate the best tools, libraries, and frameworks for this use case.

Use Case: {query}
Research Draft: {draft}
Sources: {sources}

Write a comprehensive Tool Discovery Report:

## Top Picks (TL;DR)
Best 1–3 recommendations for the most common scenarios.

## Full Tool Landscape
For each major tool: purpose, maturity, key features, GitHub stars / last release, pros & cons.

## Feature Comparison Matrix
Table comparing tools on dimensions relevant to this use case.

## Recommendation by Scenario
When to pick which tool.

## Emerging Alternatives
Newer options gaining traction worth watching.

## Getting Started
Quickstart for the #1 recommendation.

## References""",

    "explain": """You are a Master Educator. Explain this concept clearly from first principles through advanced application.

Concept: {query}
Research Draft: {draft}
Sources: {sources}

Write a comprehensive Learning Guide:

## The Big Picture
What is this, and why does it matter? Who created it and when?

## Core Concepts
Build understanding step-by-step from basics. Use analogies.

## How It Works
Technical depth — mechanisms, math, algorithms (where appropriate).

## Real-World Applications
Concrete examples and live use cases (with citations [N]).

## Hands-On Example
Code snippet, pseudocode, or worked example.

## Learning Roadmap
Prerequisites → this concept → what to learn next. Key courses, books, papers.

## Key Papers & References""",

    "research": """Transform the draft into a polished research report for a {audience} audience.

Query: {query}
Draft: {draft}
Sources: {sources}

Structure:
1. Executive Summary
2. One detailed section per research angle with inline citations [N]
3. Critical Analysis & Limitations
4. Conclusion
5. References""",
}

# ── Parallel search agent ──────────────────────────────────────────────────────

def build_mode_search_calls(
    query: str,
    mode: str,
    angles: list[str],
    reflection_hint: str = "",
) -> list[dict]:
    """
    Build a prioritized list of tool calls tailored to the research mode.
    Returns [{"tool": str, "query": str}, ...]
    """
    tools = MODE_TOOL_PRIORITY.get(mode, MODE_TOOL_PRIORITY["research"])
    hints = _MODE_SEARCH_HINTS.get(mode, [""])

    calls: list[dict] = []
    targets = angles[:4] if angles else [query]

    # Primary calls — each angle gets a tool from the priority list
    for i, target in enumerate(targets):
        tool = tools[i % len(tools)]
        hint = hints[i % len(hints)]
        search_q = f"{hint} {target}".strip() if hint else target
        calls.append({"tool": tool, "query": search_q})

    # Secondary calls — direct query through top 2 tools not yet used
    used_tools = {c["tool"] for c in calls}
    for tool in tools:
        if tool not in used_tools:
            extra_q = f"{reflection_hint} {query}".strip() if reflection_hint else query
            calls.append({"tool": tool, "query": extra_q})
            if len(calls) >= 8:
                break

    return calls


def run_parallel_agents(calls: list[dict]) -> list[dict]:
    """
    Execute all search agent calls in parallel.
    Returns merged list of document dicts.
    """
    all_docs: list[dict] = []

    def _call(c: dict) -> list[dict]:
        tool_fn = TOOL_REGISTRY.get(c.get("tool", "web_search"), TOOL_REGISTRY["web_search"])
        return tool_fn(c.get("query", ""))

    with ThreadPoolExecutor(max_workers=min(8, len(calls) or 1)) as pool:
        futures = {pool.submit(_call, c): c for c in calls}
        for fut in as_completed(futures):
            try:
                all_docs.extend(fut.result())
            except Exception as e:
                logger.warning(f"Search agent failed ({futures[fut]}): {e}")

    return all_docs
