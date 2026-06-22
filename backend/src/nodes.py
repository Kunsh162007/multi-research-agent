import json, logging, re
from concurrent.futures import ThreadPoolExecutor, as_completed
from src.llm import get_llm, get_fast_llm
from src.router import get_model
from src.state import ResearchState
from src.tools import TOOL_REGISTRY

logger = logging.getLogger(__name__)

# Findings count above which synthesis prefers the long-context tier.
_LONG_CONTEXT_FINDINGS = 18

_CONTRADICTION = """You are a contradiction-detection analyst. Examine the findings below and
identify pairs of claims that DIRECTLY conflict — opposite conclusions, incompatible numbers,
or contested facts. Be conservative: only report genuine conflicts.

Findings:
{findings}

Return ONLY valid JSON:
{{"contradictions":[{{"topic":"short label","claim_a":"...","source_a":N,"claim_b":"...","source_b":M}}]}}
If there are no real conflicts return {{"contradictions":[]}}."""

_ENHANCE = """You are a research query enhancer. Transform the user's query into a precise research plan.
Query: {query}
{prior_context}
Return ONLY valid JSON:
{{"clarified_query":"A self-contained specific version","research_angles":["angle 1","angle 2","angle 3","angle 4"]}}
Produce 3-5 distinct angles, ORDERED BY RELEVANCE to exactly what the user asked:
- Angle 1 MUST directly address the core question itself (the literal thing asked).
- Later angles widen out to related/contextual/background topics, from most to least relevant.
Do NOT lead with background or prerequisites (e.g. underlying architectures, history) — those are later angles, not the first one.
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
STRUCTURE THE ANSWER ANSWER-FIRST:
1. Open by DIRECTLY answering exactly what was asked — get to the point in the first sentences,
   before any background, history, or underlying mechanisms.
2. Then widen out to related and contextual material, ordered from most to least relevant.
Be selective: use findings that genuinely bear on the question; ignore findings that are off-topic
or only loosely related. Do not pad with background just because it appeared in the findings.
For 'validate' mode focus on novelty analysis. For 'discover' mode focus on tool comparison.
For 'explain' mode focus on clear explanation."""

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

def _llm_json_with(llm, prompt, fallback):
    for attempt in range(2):
        try:
            r = llm.invoke(prompt + ("" if attempt == 0 else "\n\nReturn ONLY valid JSON."))
            return _parse_json(r.content)
        except Exception as e:
            logger.warning(f"LLM JSON attempt {attempt+1} failed: {e}")
    return fallback


def _llm_json(prompt, fallback):
    return _llm_json_with(get_llm(temperature=0.2), prompt, fallback)


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
        "credibility": {}, "contradictions": [], "citation_check": {}, "confidence": 0.0,
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

    # Web-wide deep crawl: follow links from search hits across the whole web.
    from src.config import USE_DEEP_CRAWL
    if constraints.get("use_deep_crawl", USE_DEEP_CRAWL):
        calls.append({"tool": "deep_crawl", "query": clarified})

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
    constraints = state.get("constraints", {})
    mode = constraints.get("mode", "research")
    findings_text = "\n".join(
        f"[{f.get('citation_index', i+1)}] {f.get('source','?')}: {f.get('text','')[:500]}"
        for i, f in enumerate(findings)
    ) or "(no findings yet)"
    prompt = _GENERATE.format(
        query=state.get("clarified_query", state["query"]),
        mode=mode,
        angles=state.get("research_angles", []),
        findings=findings_text,
    )

    from src.config import USE_CONSENSUS
    if constraints.get("use_consensus", USE_CONSENSUS):
        return {"draft_answer": _consensus_generate(prompt)}

    response = get_model("heavy", temperature=0.3).invoke(prompt)
    return {"draft_answer": response.content}


def _consensus_generate(prompt: str) -> str:
    """Draft on diverse models (Groq heavy + reason, plus OpenRouter when configured);
    a reason-tier judge merges them into one superior answer."""
    drafts = []
    for role in ("heavy", "reason"):
        try:
            drafts.append(get_model(role, temperature=0.3).invoke(prompt).content)
        except Exception as e:
            logger.warning(f"Consensus draft ({role}) failed: {e}")

    # Cross-provider voice via OpenRouter (no-op when OPENROUTER_API_KEY unset)
    from src.router import openrouter_complete
    or_draft = openrouter_complete(prompt, temperature=0.3)
    if or_draft:
        drafts.append(or_draft)

    if not drafts:
        return ""
    if len(drafts) == 1:
        return drafts[0]
    try:
        labelled = "\n\n".join(f"DRAFT {chr(65 + i)}:\n{d}" for i, d in enumerate(drafts))
        judge_prompt = (
            f"{len(drafts)} draft answers to the same task are below. Merge them into one "
            "superior answer: keep every well-supported claim, drop anything unsupported, "
            "preserve inline [N] citations.\n\n" + labelled
        )
        return get_model("reason", temperature=0.2).invoke(judge_prompt).content
    except Exception as e:
        logger.warning(f"Consensus merge failed: {e}")
        return drafts[0]


def verify(state: ResearchState) -> dict:
    """Deterministic citation verification: every [N] in the draft must map to a finding."""
    findings = state.get("findings", [])
    valid = {f.get("citation_index", i + 1) for i, f in enumerate(findings)}
    draft = state.get("draft_answer", "") or ""
    used = {int(n) for n in re.findall(r"\[(\d+)\]", draft)}
    invalid = sorted(used - valid)
    cited_text = " ".join(str(n) for n in used)
    uncited_angles = [
        a for a in state.get("research_angles", [])
        if not used  # if nothing cited at all, flag every angle
    ]
    check = {
        "valid": sorted(used & valid),
        "invalid": invalid,
        "all_supported": not invalid and bool(used),
        "uncited_angles": uncited_angles,
    }
    if invalid:
        logger.info(f"Citation verify: dangling citations {invalid} (valid={sorted(valid)})")
    return {"citation_check": check}


def contradiction(state: ResearchState) -> dict:
    """Flag conflicting claims across findings using the reasoning tier."""
    findings = state.get("findings", [])
    if len(findings) < 2:
        return {"contradictions": []}
    findings_text = "\n".join(
        f"[{f.get('citation_index', i+1)}] {f.get('source','?')}: {f.get('text','')[:400]}"
        for i, f in enumerate(findings)
    )
    try:
        result = _llm_json_with(
            get_model("reason", temperature=0.1),
            _CONTRADICTION.format(findings=findings_text),
            fallback={"contradictions": []},
        )
        items = result.get("contradictions", []) or []
        if items:
            logger.info(f"Contradiction node: {len(items)} conflict(s) flagged")
        return {"contradictions": items}
    except Exception as e:
        logger.warning(f"Contradiction detection failed: {e}")
        return {"contradictions": []}


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

    # Encourage rich, mixed-format output: diagrams + tables.
    diagram_emphasis = mode in ("explain", "research")
    prompt += (
        "\n\nFORMAT: Use GitHub-flavored Markdown. Where a process, architecture, comparison, "
        "timeline, or relationship would aid understanding, include a Mermaid diagram in a "
        "```mermaid fenced code block (flowchart/sequenceDiagram/timeline/mindmap). Use Markdown "
        "tables for comparisons."
        + (" Include at least one Mermaid diagram." if diagram_emphasis else "")
    )

    # Append a Conflicting Evidence directive when contradictions were detected.
    contradictions = state.get("contradictions", []) or []
    if contradictions:
        conflict_lines = "\n".join(
            f"- {c.get('topic','conflict')}: [{c.get('source_a','?')}] {c.get('claim_a','')} "
            f"VS [{c.get('source_b','?')}] {c.get('claim_b','')}"
            for c in contradictions[:6]
        )
        prompt += (
            "\n\nIMPORTANT: The sources contain conflicting evidence. Add a '## Conflicting Evidence' "
            "section that presents both sides with citations:\n" + conflict_lines
        )

    # Use the long-context tier when there are many findings to synthesize.
    role = "long" if len(findings) >= _LONG_CONTEXT_FINDINGS else "heavy"
    response = get_model(role, temperature=0.3).invoke(prompt)
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
