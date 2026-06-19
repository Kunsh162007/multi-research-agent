"""
Research-paper-inspired RAG enhancements. Each is toggleable via constraints dict.

1. Adaptive RAG (Jeong et al., 2024)
   Classifies query complexity (0-3) and adjusts quality_target + max_iterations.

2. HyDE — Hypothetical Document Embeddings (Gao et al., 2022)
   Generates a hypothetical ideal answer first, uses it to produce better search queries.
   Why it works: hypothetical documents are closer in embedding space to real answers.

3. RAG Fusion (Rackauckas, 2023)
   Generates N diverse query variations, searches each, merges via Reciprocal Rank Fusion.
   Why it works: multiple perspectives surface documents a single query would miss.

4. Reflexion (Shinn et al., 2023)
   When quality is critically low, agent reflects on WHY and generates targeted recovery queries.
   Why it works: explicit self-critique breaks out of retrieval ruts.

5. STORM — multi-perspective (Shao et al., Stanford 2024)
   Generates distinct expert personas before research; each persona contributes unique angles.
   Why it works: diverse viewpoints reduce blind spots and improve recall.
"""

import json
import logging
from src.llm import get_llm
from src.state import ResearchState
from src.tools import TOOL_REGISTRY

logger = logging.getLogger(__name__)

REFLECT_QUALITY_THRESHOLD = 40   # only trigger Reflexion below this score

# ─── Prompts ───────────────────────────────────────────────────────────────────

_CLASSIFY = """Classify the complexity of this research query on a scale of 0-3.

0 = Simple factual (answerable from training data, no retrieval needed)
1 = Moderate (1-2 retrieval rounds, clear single topic)
2 = Complex (3-5 rounds, multiple interconnected subtopics)
3 = Expert/deep (6-8 rounds, cutting-edge, highly technical, requires synthesis)

Query: {query}

Return ONLY valid JSON:
{{"complexity": 0-3, "reason": "one sentence"}}"""

_HYDE = """You are a world-class researcher. Write a dense, technical answer to this query
as if you have already read all relevant papers and sources. This is a HYPOTHETICAL
answer — optimistic, specific, and detailed. It will be used to find real sources.

Query: {query}

Write 2-3 paragraphs. Be specific with terminology, model names, techniques, and metrics."""

_RAG_FUSION_QUERIES = """Generate {n} diverse search queries that together give full coverage of:

Query: {query}
Research angles: {angles}

Vary the queries by:
- Perspective (theoretical / practical / comparative)
- Specificity (broad overview / narrow technical detail)
- Source type (academic paper / implementation / tutorial)

Return ONLY valid JSON:
{{"queries": [{{"tool": "web_search|arxiv_search|github_search", "query": "..."}}]}}"""

_REFLECT = """You are a research critic performing Reflexion.

Original query: {query}
Research angles: {angles}
Current quality score: {quality}/100
Quality feedback: {feedback}
Number of findings: {num_findings}

Diagnose the failure. Be specific:
- Which angles are uncovered?
- What type of sources are missing?
- What went wrong with the search strategy?

Then propose targeted recovery actions.

Return ONLY valid JSON:
{{
  "diagnosis": "specific analysis of what is missing and why",
  "targeted_queries": [
    {{"tool": "arxiv_search|web_search|github_search", "query": "very specific recovery query"}}
  ]
}}"""

_STORM_PERSONAS = """You are a research architect using the STORM methodology.
Generate {n} distinct expert personas who would research this topic differently.

Topic: {query}

Each persona should have a unique professional lens and ask questions others would not.
Examples: ML researcher, software engineer, product manager, ethicist, domain specialist.

Return ONLY valid JSON:
{{
  "personas": [
    {{
      "role": "Expert Title",
      "focus": "their specific angle",
      "questions": ["specific question 1", "specific question 2"]
    }}
  ]
}}"""


# ─── Helpers ───────────────────────────────────────────────────────────────────

def _parse_json(text: str, fallback: dict) -> dict:
    text = text.strip()
    if text.startswith("```"):
        parts = text.split("```")
        text = parts[1] if len(parts) > 1 else text
        if text.startswith("json"):
            text = text[4:]
    try:
        return json.loads(text.strip())
    except Exception:
        return fallback


def _llm_call(prompt: str) -> str:
    llm = get_llm(temperature=0.2)
    return llm.invoke(prompt).content


# ─── 1. Adaptive RAG ───────────────────────────────────────────────────────────

def classify_and_adapt(state: ResearchState) -> dict:
    """
    Adaptive RAG: classify query complexity and adjust constraints accordingly.
    Called as first step after enhance when use_adaptive=True.
    """
    result = _parse_json(
        _llm_call(_CLASSIFY.format(query=state.get("clarified_query", state["query"]))),
        fallback={"complexity": 1, "reason": "fallback"},
    )
    complexity = result.get("complexity", 1)

    # Map complexity → (quality_target, max_iterations)
    _params = {0: (50, 1), 1: (65, 3), 2: (75, 6), 3: (85, 8)}
    qt, mi = _params.get(complexity, (75, 6))

    existing = dict(state.get("constraints", {}))
    # Only override if user did not set them explicitly
    if "quality_target" not in existing:
        existing["quality_target"] = qt
    if "max_iterations" not in existing:
        existing["max_iterations"] = mi

    logger.info(f"Adaptive RAG: complexity={complexity} → quality_target={qt}, max_iterations={mi}")
    return {"constraints": existing}


# ─── 2. HyDE ──────────────────────────────────────────────────────────────────

def generate_hyde_document(query: str) -> str:
    """
    HyDE: generate a hypothetical ideal answer to use as a retrieval anchor.
    """
    try:
        return _llm_call(_HYDE.format(query=query))
    except Exception as e:
        logger.warning(f"HyDE document generation failed: {e}")
        return query


def hyde_enhanced_retrieve(state: ResearchState) -> dict:
    """
    Retrieve step augmented with HyDE: uses the hypothetical document to
    generate richer, more targeted search queries.
    """
    clarified = state.get("clarified_query", state["query"])
    hyde_doc = generate_hyde_document(clarified)

    # Use HyDE doc to generate better queries
    hyde_prompt = f"""Based on this hypothetical ideal answer:

{hyde_doc[:800]}

Generate 2-3 search queries that would find real evidence supporting these claims.
Cover: academic papers (arxiv_search), implementations (github_search), articles (web_search).

Return ONLY valid JSON:
{{"tool_calls": [{{"tool": "...", "query": "..."}}]}}"""

    result = _parse_json(_llm_call(hyde_prompt), fallback={"tool_calls": [{"tool": "web_search", "query": clarified}]})

    all_docs = []
    for call in result.get("tool_calls", []):
        tool_fn = TOOL_REGISTRY.get(call.get("tool", "web_search"), TOOL_REGISTRY["web_search"])
        try:
            docs = tool_fn(call.get("query", clarified))
            all_docs.extend(docs)
            logger.info(f"HyDE retrieval: {call['tool']}({call['query']!r}) → {len(docs)} docs")
        except Exception as e:
            logger.error(f"HyDE tool call failed: {e}")

    return {"retrieved_docs": all_docs}


# ─── 3. RAG Fusion ────────────────────────────────────────────────────────────

def _reciprocal_rank_fusion(doc_lists: list[list[dict]], k: int = 60) -> list[dict]:
    """
    Merge multiple ranked doc lists via Reciprocal Rank Fusion.
    score(d) = Σ 1/(rank + k) across all lists containing d.
    """
    scores: dict[str, dict] = {}
    for doc_list in doc_lists:
        for rank, doc in enumerate(doc_list):
            key = doc.get("url", "") or doc.get("source", "") or str(rank)
            if key not in scores:
                scores[key] = {"score": 0.0, "doc": doc}
            scores[key]["score"] += 1.0 / (rank + k)

    return [v["doc"] for v in sorted(scores.values(), key=lambda x: x["score"], reverse=True)]


def rag_fusion_retrieve(state: ResearchState, n_queries: int = 3) -> dict:
    """
    RAG Fusion: generate N query variations, retrieve for each, merge via RRF.
    """
    clarified = state.get("clarified_query", state["query"])
    result = _parse_json(
        _llm_call(_RAG_FUSION_QUERIES.format(
            n=n_queries,
            query=clarified,
            angles=state.get("research_angles", []),
        )),
        fallback={"queries": [{"tool": "web_search", "query": clarified}]},
    )

    doc_lists = []
    for call in result.get("queries", [])[:n_queries]:
        tool_fn = TOOL_REGISTRY.get(call.get("tool", "web_search"), TOOL_REGISTRY["web_search"])
        try:
            docs = tool_fn(call.get("query", clarified))
            doc_lists.append(docs)
            logger.info(f"RAG Fusion query: {call['tool']}({call['query']!r}) → {len(docs)} docs")
        except Exception as e:
            logger.error(f"RAG Fusion query failed: {e}")

    fused = _reciprocal_rank_fusion(doc_lists)
    logger.info(f"RAG Fusion: {sum(len(d) for d in doc_lists)} raw → {len(fused)} after RRF")
    return {"retrieved_docs": fused}


# ─── 4. Reflexion ─────────────────────────────────────────────────────────────

def reflect(state: ResearchState) -> dict:
    """
    Reflexion node: runs when quality is critically low.
    Produces a diagnosis and targeted recovery queries stored in state.
    """
    quality = state.get("answer_quality", {}).get("overall", 0)
    feedback = state.get("answer_quality", {}).get("feedback", "No feedback")

    result = _parse_json(
        _llm_call(_REFLECT.format(
            query=state.get("clarified_query", state["query"]),
            angles=state.get("research_angles", []),
            quality=quality,
            feedback=feedback,
            num_findings=len(state.get("findings", [])),
        )),
        fallback={"diagnosis": "Insufficient coverage", "targeted_queries": []},
    )

    diagnosis = result.get("diagnosis", "")
    targeted = result.get("targeted_queries", [])
    logger.info(f"Reflexion: {diagnosis[:120]}")

    # Execute targeted recovery queries immediately
    all_docs = list(state.get("retrieved_docs", []))
    for call in targeted[:3]:
        tool_fn = TOOL_REGISTRY.get(call.get("tool", "web_search"), TOOL_REGISTRY["web_search"])
        try:
            docs = tool_fn(call.get("query", state["query"]))
            all_docs.extend(docs)
        except Exception as e:
            logger.error(f"Reflexion recovery query failed: {e}")

    return {
        "retrieved_docs": all_docs,
        "needs_retrieval": True,
        "status": f"reflecting: {diagnosis[:80]}",
    }


def should_reflect(state: ResearchState) -> str:
    """
    Extended routing: returns 'reflect', 'synthesize', or 'decide_retrieval'.
    """
    quality = state.get("answer_quality", {}).get("overall", 0)
    iteration = state.get("iteration", 0)
    max_iter = state.get("constraints", {}).get("max_iterations", 8)
    quality_target = state.get("constraints", {}).get("quality_target", 75)
    use_reflexion = state.get("constraints", {}).get("use_reflexion", True)

    if quality >= quality_target:
        return "synthesize"
    if iteration >= max_iter:
        return "synthesize"
    # Trigger Reflexion only on first severe failure (iteration 1 or 2)
    if use_reflexion and quality < REFLECT_QUALITY_THRESHOLD and iteration <= 2:
        logger.info(f"Reflexion triggered: quality={quality} < {REFLECT_QUALITY_THRESHOLD}")
        return "reflect"
    return "decide_retrieval"


# ─── 5. STORM multi-perspective ───────────────────────────────────────────────

def storm_enhance(state: ResearchState) -> dict:
    """
    STORM-style enhancement: generate expert personas, extract their unique questions
    as research angles, replacing the default enhance angles.
    """
    query = state["query"]
    result = _parse_json(
        _llm_call(_STORM_PERSONAS.format(n=4, query=query)),
        fallback={"personas": []},
    )

    angles = []
    for persona in result.get("personas", []):
        role = persona.get("role", "")
        for q in persona.get("questions", [])[:2]:
            angles.append(f"[{role}] {q}")

    if not angles:
        return {}  # fall back to standard enhance angles

    logger.info(f"STORM: generated {len(angles)} angles from {len(result.get('personas', []))} personas")
    return {"research_angles": angles[:8]}
