from typing import TypedDict, List, Dict, Any, Optional


class ResearchState(TypedDict):
    # identity
    thread_id: str

    # input
    query: str
    user_context: Dict[str, Any]   # {audience, user_id}
    constraints: Dict[str, Any]    # {max_iterations, quality_target}

    # phase 1
    clarified_query: str
    research_angles: List[str]

    # phase 2 working memory
    iteration: int
    needs_retrieval: bool
    retrieved_docs: List[Dict[str, Any]]   # [{text, source, url, relevance}]
    findings: List[Dict[str, Any]]          # graded + accepted docs with citation_index

    draft_answer: str
    answer_quality: Dict[str, Any]          # {supported, complete, overall, feedback}

    # phase 3/4
    report: str
    validation: Dict[str, Any]

    # control
    done: bool
    status: str          # "running" | "quality_achieved" | "max_iterations" | "error"
    error: Optional[str]
