import sqlite3
from langgraph.graph import StateGraph, END
from langgraph.checkpoint.sqlite import SqliteSaver
from src.state import ResearchState
from src.nodes import enhance, retrieve, generate, synthesize, validate, route_after_grading
from src.self_rag import decide_retrieval, grade_relevance, grade_answer
from src.advanced_rag import reflect
from src.config import CHECKPOINT_DB


def build_graph():
    builder = StateGraph(ResearchState)

    builder.add_node("enhance", enhance)
    builder.add_node("decide_retrieval", decide_retrieval)
    builder.add_node("retrieve", retrieve)
    builder.add_node("grade_relevance", grade_relevance)
    builder.add_node("generate", generate)
    builder.add_node("grade_answer", grade_answer)
    builder.add_node("reflect", reflect)        # Reflexion node (Shinn et al., 2023)
    builder.add_node("synthesize", synthesize)
    builder.add_node("validate", validate)

    builder.set_entry_point("enhance")
    builder.add_edge("enhance", "decide_retrieval")
    builder.add_conditional_edges(
        "decide_retrieval",
        lambda s: "retrieve" if s.get("needs_retrieval") else "generate",
        {"retrieve": "retrieve", "generate": "generate"},
    )
    builder.add_edge("retrieve", "grade_relevance")
    builder.add_edge("grade_relevance", "generate")
    builder.add_edge("generate", "grade_answer")
    builder.add_conditional_edges(
        "grade_answer",
        route_after_grading,
        {"synthesize": "synthesize", "decide_retrieval": "decide_retrieval", "reflect": "reflect"},
    )
    # After Reflexion, go back to grade_relevance (retrieved_docs are already populated)
    builder.add_edge("reflect", "grade_relevance")
    builder.add_edge("synthesize", "validate")
    builder.add_edge("validate", END)

    conn = sqlite3.connect(CHECKPOINT_DB, check_same_thread=False)
    return builder.compile(checkpointer=SqliteSaver(conn))


graph = build_graph()
