import json, logging
from src.llm import get_llm
from src.state import ResearchState
from src.tools import TOOL_REGISTRY

logger = logging.getLogger(__name__)

_ENHANCE = """You are a research query enhancer. Transform the user's query into a precise research plan.
Query: {query}
Return ONLY valid JSON:
{{"clarified_query":"A self-contained specific version","research_angles":["angle 1","angle 2","angle 3","angle 4"]}}
Produce 3-5 distinct angles that together give complete coverage."""

_RETRIEVE = """You are an autonomous research agent. Choose tools: web_search, arxiv_search, github_search.
Query: {query} | Angles: {angles} | Findings: {num_findings} | Iteration: {iteration}
{reflection_hint}
Pick 1-3 tool calls addressing least-covered angles.
Return ONLY valid JSON: {{"tool_calls":[{{"tool":"tool_name","query":"search string"}}]}}"""

_GENERATE = """Write a draft answer grounded ONLY in findings. Use inline citations [1],[2]...
Query: {query} | Angles: {angles}
Findings:
{findings}
Write thoroughly, covering every angle."""

_SYNTHESIZE = """Transform the draft into a polished report for a {audience} audience.
Query: {query}
Draft: {draft}
Sources: {sources}
Structure: 1.Executive Summary 2.One section per angle with citations[N] 3.Conclusion 4.References"""

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


def enhance(state: ResearchState) -> dict:
    result = _llm_json(_ENHANCE.format(query=state["query"]),
        fallback={"clarified_query": state["query"], "research_angles": [state["query"]]})

    base = {
        "clarified_query": result.get("clarified_query", state["query"]),
        "research_angles": result.get("research_angles", [state["query"]]),
        "iteration": 0, "needs_retrieval": True, "retrieved_docs": [], "findings": [],
        "draft_answer": "", "answer_quality": {}, "report": "", "validation": {},
        "done": False, "status": "running", "error": None,
    }

    # STORM multi-perspective (if enabled)
    constraints = state.get("constraints", {})
    if constraints.get("use_storm"):
        from src.advanced_rag import storm_enhance
        storm_update = storm_enhance({**state, **base})
        if storm_update.get("research_angles"):
            base["research_angles"] = storm_update["research_angles"]

    # Adaptive RAG (if enabled — auto-adjusts quality_target + max_iterations)
    if constraints.get("use_adaptive", True):
        from src.advanced_rag import classify_and_adapt
        adapt = classify_and_adapt({**state, **base})
        base["constraints"] = adapt.get("constraints", constraints)

    return base


def retrieve(state: ResearchState) -> dict:
    if not state.get("needs_retrieval", True):
        return {}

    constraints = state.get("constraints", {})
    clarified = state.get("clarified_query", state["query"])

    # HyDE retrieval
    if constraints.get("use_hyde"):
        from src.advanced_rag import hyde_enhanced_retrieve
        return hyde_enhanced_retrieve(state)

    # RAG Fusion retrieval
    if constraints.get("use_rag_fusion"):
        from src.advanced_rag import rag_fusion_retrieve
        return rag_fusion_retrieve(state)

    # Standard retrieval with optional Reflexion hint
    reflection = state.get("status", "")
    reflection_hint = f"REFLEXION HINT: {reflection}\n" if reflection.startswith("reflecting:") else ""

    result = _llm_json(_RETRIEVE.format(
        query=clarified, angles=state.get("research_angles", []),
        num_findings=len(state.get("findings", [])),
        iteration=state.get("iteration", 0),
        reflection_hint=reflection_hint,
    ), fallback={"tool_calls": [{"tool": "web_search", "query": clarified}]})

    all_docs = []
    for call in result.get("tool_calls", []):
        tool_fn = TOOL_REGISTRY.get(call.get("tool", "web_search"), TOOL_REGISTRY["web_search"])
        try:
            docs = tool_fn(call.get("query", clarified))
            all_docs.extend(docs)
        except Exception as e:
            logger.error(f"Tool {call.get('tool')} failed: {e}")

    return {"retrieved_docs": all_docs}


def generate(state: ResearchState) -> dict:
    findings = state.get("findings", [])
    findings_text = "\n".join(
        f"[{f.get('citation_index', i+1)}] {f.get('source','?')}: {f.get('text','')[:500]}"
        for i, f in enumerate(findings)
    ) or "(no findings yet)"
    response = get_llm(temperature=0.3).invoke(_GENERATE.format(
        query=state.get("clarified_query", state["query"]),
        angles=state.get("research_angles", []), findings=findings_text,
    ))
    return {"draft_answer": response.content}


def synthesize(state: ResearchState) -> dict:
    findings = state.get("findings", [])
    sources = "\n".join(f"[{f.get('citation_index',i+1)}] {f.get('source','?')} — {f.get('url','')}" for i, f in enumerate(findings)) or "(none)"
    audience = state.get("user_context", {}).get("audience", "general")
    response = get_llm(temperature=0.3).invoke(_SYNTHESIZE.format(
        audience=audience, query=state.get("clarified_query", state["query"]),
        draft=state.get("draft_answer", ""), sources=sources,
    ))
    return {"report": response.content}


def validate(state: ResearchState) -> dict:
    result = _llm_json(_VALIDATE.format(
        query=state.get("clarified_query", state["query"]),
        report=(state.get("report") or "")[:2000],
    ), fallback={"accuracy":70,"completeness":70,"clarity":70,"overall":70,"summary":"Validation unavailable"})

    # Generate follow-up suggestions and attach to validation
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
