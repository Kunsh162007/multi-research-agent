import json, logging
from concurrent.futures import ThreadPoolExecutor, as_completed
from src.llm import get_llm, get_fast_llm
from src.state import ResearchState
from src.tools import TOOL_REGISTRY

logger = logging.getLogger(__name__)

_ENHANCE = """You are a research query enhancer. Transform the user's query into a precise research plan.
Query: {query}
{prior_context}
Return ONLY valid JSON:
{{"clarified_query":"A self-contained specific version","research_angles":["angle 1","angle 2","angle 3","angle 4"]}}
Produce 3-5 distinct angles that together give complete coverage.
If prior research context is provided, build upon it — focus on aspects NOT already covered."""

_REWRITE_QUERY = """Rewrite this research query to be clearer and more searchable.
Fix spelling, expand abbreviations, make implicit context explicit. Keep it concise.
Query: {query}
Rewritten query (plain text only):"""

_RETRIEVE_FALLBACK = """You are an autonomous research agent. Choose tools: web_search, arxiv_search, github_search, wikipedia_search, semantic_scholar_search, crossref_search.
Query: {query} | Angles: {angles} | Findings: {num_findings} | Iteration: {iteration}
{reflection_hint}
Pick 1-3 tool calls addressing least-covered angles.
Return ONLY valid JSON: {{"tool_calls":[{{"tool":"tool_name","query":"search string"}}]}}"""

_GENERATE = """Write a draft answer grounded ONLY in findings. Use inline citations [1],[2]...
Query: {query} | Mode: {mode} | Angles: {angles}
Findings:
{findings}
Write thoroughly, covering every angle. For 'validate' mode focus on novelty analysis.
For 'discover' mode focus on tool comparison. For 'explain' mode focus on clear explanation."""

_VALIDATE = """Score this report 0-100 on accuracy,completeness,clarity,overall.
Query: {query} | Report: {report}
Return ONLY valid JSON: {{"accuracy":0-100,"completeness":0-100,"clarity":0-100,"overall":0-100,"summary":"one sentence"}}"""


def _parse_json(text: str) -> dict:
    text = text.strip()
    if text.startswith("```"):
        parts = text.split("```")
        text = parts[1] if len(parts) > 1 else text
        if text.startswith("json"): text = text[4:]
    return json.loads(text.strip())

def _llm_json(prompt, fallback):
    llm = get_llm(temperature=0.2)
    for attempt in range(2):
        try:
            r = llm.invoke(prompt + ("" if attempt == 0 else "\n\nReturn ONLY valid JSON."))
            return _parse_json(r.content)
        except Exception as e:
            logger.warning(f"LLM JSON attempt {attempt+1} failed: {e}")
    return fallback


def _rewrite_query(query: str) -> str:
    try:
        response = get_fast_llm(temperature=0.0).invoke(_REWRITE_QUERY.format(query=query))
        rewritten = response.content.strip().strip('"').strip("'")
        return rewritten if rewritten else query
    except Exception:
        return query


def _jaccard_sim(a: str, b: str) -> float:
    sa, sb = set(a.lower().split()), set(b.lower().split())
    if not sa or not sb:
        return 0.0
    return len(sa & sb) / len(sa | sb)


def _dedup_docs(docs: list, threshold: float = 0.75) -> list:
    seen_texts: list = []
    result = []
    for doc in docs:
        text = doc.get("text", "")
        if not any(_jaccard_sim(text, t) > threshold for t in seen_texts):
            seen_texts.append(text)
            result.append(doc)
    return result


def enhance(state: ResearchState) -> dict:
    query = _rewrite_query(state["query"])
    prior = state.get("user_context", {}).get("prior_research", "")
    prior_context = f"Prior research context (build upon this, don't repeat it):\n{prior}" if prior else ""
    result = _llm_json(_ENHANCE.format(query=query, prior_context=prior_context),
        fallback={"clarified_query": query, "research_angles": [query]})

    constraints = state.get("constraints", {})

    # Auto-detect mode if not set by user
    mode = constraints.get("mode")
    if not mode:
        from src.agents import detect_mode
        mode = detect_mode(query)
        constraints = {**constraints, "mode": mode}

    base = {
        "clarified_query": result.get("clarified_query", state["query"]),
        "research_angles": result.get("research_angles", [state["query"]]),
        "iteration": 0, "needs_retrieval": True, "retrieved_docs": [], "findings": [],
        "draft_answer": "", "answer_quality": {}, "report": "", "validation": {},
        "done": False, "status": "running", "error": None,
        "constraints": constraints,
    }

    # STORM multi-perspective (if enabled)
    if constraints.get("use_storm"):
        from src.advanced_rag import storm_enhance
        storm_update = storm_enhance({**state, **base})
        if storm_update.get("research_angles"):
            base["research_angles"] = storm_update["research_angles"]

    # Adaptive RAG (if enabled)
    if constraints.get("use_adaptive", True):
        from src.advanced_rag import classify_and_adapt
        adapt = classify_and_adapt({**state, **base})
        base["constraints"] = adapt.get("constraints", base["constraints"])

    return base


def retrieve(state: ResearchState) -> dict:
    if not state.get("needs_retrieval", True):
        return {}

    constraints = state.get("constraints", {})
    clarified = state.get("clarified_query", state["query"])
    mode = constraints.get("mode", "research")

    # HyDE retrieval
    if constraints.get("use_hyde"):
        from src.advanced_rag import hyde_enhanced_retrieve
        return hyde_enhanced_retrieve(state)

    # RAG Fusion retrieval
    if constraints.get("use_rag_fusion"):
        from src.advanced_rag import rag_fusion_retrieve
        return rag_fusion_retrieve(state)

    reflection = state.get("status", "")
    reflection_hint = f"REFLEXION HINT: {reflection}\n" if reflection.startswith("reflecting:") else ""

    # Use mode-specific parallel agents
    from src.agents import build_mode_search_calls, run_parallel_agents
    calls = build_mode_search_calls(
        query=clarified,
        mode=mode,
        angles=state.get("research_angles", []),
        reflection_hint=reflection_hint.strip(),
    )

    # Fallback: also ask LLM which tool calls to make (for complex queries)
    if state.get("iteration", 0) > 0:
        try:
            fallback_result = _llm_json(_RETRIEVE_FALLBACK.format(
                query=clarified, angles=state.get("research_angles", []),
                num_findings=len(state.get("findings", [])),
                iteration=state.get("iteration", 0),
                reflection_hint=reflection_hint,
            ), fallback={"tool_calls": []})
            for tc in fallback_result.get("tool_calls", []):
                if tc not in calls:
                    calls.append(tc)
        except Exception as e:
            logger.warning(f"LLM fallback tool selection skipped: {e}")

    all_docs = run_parallel_agents(calls)

    # Preserve preloaded docs (uploaded files / URL context)
    preloaded = [d for d in state.get("retrieved_docs", []) if d.get("preloaded")]
    return {"retrieved_docs": _dedup_docs(preloaded + all_docs)}


def generate(state: ResearchState) -> dict:
    findings = state.get("findings", [])
    mode = state.get("constraints", {}).get("mode", "research")
    findings_text = "\n".join(
        f"[{f.get('citation_index', i+1)}] {f.get('source','?')}: {f.get('text','')[:500]}"
        for i, f in enumerate(findings)
    ) or "(no findings yet)"
    response = get_llm(temperature=0.3).invoke(_GENERATE.format(
        query=state.get("clarified_query", state["query"]),
        mode=mode,
        angles=state.get("research_angles", []),
        findings=findings_text,
    ))
    return {"draft_answer": response.content}


def synthesize(state: ResearchState) -> dict:
    findings = state.get("findings", [])
    sources = "\n".join(
        f"[{f.get('citation_index',i+1)}] {f.get('source','?')} — {f.get('url','')}"
        for i, f in enumerate(findings)
    ) or "(none)"
    mode = state.get("constraints", {}).get("mode", "research")
    audience = state.get("user_context", {}).get("audience", "general")

    from src.agents import MODE_SYNTHESIS_PROMPTS
    prompt_template = MODE_SYNTHESIS_PROMPTS.get(mode, MODE_SYNTHESIS_PROMPTS["research"])
    prompt = prompt_template.format(
        query=state.get("clarified_query", state["query"]),
        draft=state.get("draft_answer", ""),
        sources=sources,
        audience=audience,
    )
    response = get_llm(temperature=0.3).invoke(prompt)
    return {"report": response.content}


def validate(state: ResearchState) -> dict:
    result = _llm_json(_VALIDATE.format(
        query=state.get("clarified_query", state["query"]),
        report=(state.get("report") or "")[:2000],
    ), fallback={"accuracy":70,"completeness":70,"clarity":70,"overall":70,"summary":"Validation unavailable"})

    try:
        from src.suggestions import generate_follow_ups
        questions = generate_follow_ups(state.get("clarified_query", state["query"]), state.get("report", ""))
        result["follow_up_questions"] = questions
    except Exception:
        result["follow_up_questions"] = []

    quality = state.get("answer_quality", {}).get("overall", 0)
    target = state.get("constraints", {}).get("quality_target", 75)
    return {"validation": result, "done": True, "status": "quality_achieved" if quality >= target else "max_iterations"}


def route_after_grading(state: ResearchState) -> str:
    from src.advanced_rag import should_reflect
    return should_reflect(state)
