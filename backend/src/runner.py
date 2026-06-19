"""
High-level run/resume orchestration.

run_research()   — start a new research run, stream SSE events
resume_research() — resume an interrupted run (same thread_id)

Both are async generators that yield SSE-formatted strings.
"""

import asyncio
import logging
import uuid
from typing import AsyncGenerator, Optional

from src.config import MAX_ITERATIONS, QUALITY_TARGET
from src.graph import graph
from src.history import history_store
from src.state import ResearchState
from src.streaming import error_event, final_event, state_event, step_event, token_event

logger = logging.getLogger(__name__)

# Pretty labels for each node shown in the UI progress feed
_NODE_LABELS = {
    "enhance": "Clarifying query and planning research angles",
    "decide_retrieval": "Deciding whether to fetch more information (Self-RAG)",
    "retrieve": "Searching the web, arXiv, and GitHub",
    "grade_relevance": "Grading document relevance (Self-RAG)",
    "generate": "Drafting answer from findings",
    "grade_answer": "Scoring answer quality (Self-RAG)",
    "synthesize": "Synthesizing final report",
    "validate": "Validating report quality",
}


async def _stream_graph(
    initial_state: ResearchState,
    config: dict,
) -> AsyncGenerator[str, None]:
    """
    Consume the LangGraph astream and emit SSE events.
    Uses stream_mode="updates" to get per-node output dicts.
    """
    try:
        # Run graph in a thread to avoid blocking the event loop with sync SQLite ops
        loop = asyncio.get_event_loop()

        def _run_sync():
            return list(graph.stream(initial_state, config=config, stream_mode="updates"))

        chunks = await loop.run_in_executor(None, _run_sync)

        for chunk in chunks:
            for node_name, updates in chunk.items():
                label = _NODE_LABELS.get(node_name, node_name)

                if node_name == "retrieve":
                    num_docs = len(updates.get("retrieved_docs", []))
                    detail = f"{label} — {num_docs} documents retrieved"
                elif node_name == "grade_relevance":
                    num_accepted = len(updates.get("findings", []))
                    detail = f"{label} — {num_accepted} documents accepted"
                elif node_name == "grade_answer":
                    quality = updates.get("answer_quality", {}).get("overall", 0)
                    iteration = updates.get("iteration", 0)
                    detail = f"{label} — quality score: {quality}/100"
                    yield step_event(node_name, detail)
                    yield state_event(iteration, int(quality))
                    continue
                else:
                    detail = label

                yield step_event(node_name, detail)

    except Exception as e:
        logger.exception(f"Graph streaming error: {e}")
        yield error_event(str(e))
        return

    # Retrieve final state after graph completes
    try:
        final = graph.get_state(config)
        values = final.values if hasattr(final, "values") else {}
    except Exception as e:
        logger.error(f"Could not retrieve final state: {e}")
        yield error_event(f"Could not retrieve final state: {e}")
        return

    report = values.get("report", "")
    validation = values.get("validation", {})
    thread_id = values.get("thread_id", config["configurable"]["thread_id"])

    # Stream the report text in chunks to give a "typing" effect in the UI
    chunk_size = 40
    for i in range(0, len(report), chunk_size):
        yield token_event(report[i: i + chunk_size])
        await asyncio.sleep(0)  # yield control to event loop between chunks

    yield final_event(report, validation, thread_id)


async def run_research(
    query: str,
    user_id: str,
    thread_id: Optional[str] = None,
    audience: str = "general",
    constraints: Optional[dict] = None,
) -> AsyncGenerator[str, None]:
    thread_id = thread_id or str(uuid.uuid4())
    constraints = constraints or {}

    initial_state: ResearchState = {
        "thread_id": thread_id,
        "query": query,
        "user_context": {"audience": audience, "user_id": user_id},
        "constraints": {
            "max_iterations": constraints.get("max_iterations", MAX_ITERATIONS),
            "quality_target": constraints.get("quality_target", QUALITY_TARGET),
            "use_hyde": bool(constraints.get("use_hyde", False)),
            "use_rag_fusion": bool(constraints.get("use_rag_fusion", False)),
            "use_storm": bool(constraints.get("use_storm", False)),
            "use_adaptive": bool(constraints.get("use_adaptive", True)),
            "use_reflexion": bool(constraints.get("use_reflexion", True)),
        },
        "clarified_query": "",
        "research_angles": [],
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

    # Namespace thread_id per user so two users can't access each other's checkpoints
    ckpt_thread_id = f"{user_id}:{thread_id}"
    config = {"configurable": {"thread_id": ckpt_thread_id}}

    history_store.create_conversation(thread_id, user_id, query)
    history_store.add_message(thread_id, user_id, "user", query)

    report_parts: list[str] = []
    validation_result: dict = {}

    try:
        async for event_str in _stream_graph(initial_state, config):
            yield event_str
            # Collect final event data for history persistence
            if '"type": "token"' in event_str:
                import json
                try:
                    data = json.loads(event_str.replace("data: ", "").strip())
                    report_parts.append(data.get("text", ""))
                except Exception:
                    pass
            elif '"type": "final"' in event_str:
                import json
                try:
                    data = json.loads(event_str.replace("data: ", "").strip())
                    validation_result = data.get("validation", {})
                except Exception:
                    pass
    finally:
        # Persist the completed assistant message regardless of success/failure
        full_report = "".join(report_parts)
        if full_report:
            history_store.add_message(
                thread_id,
                user_id,
                "assistant",
                full_report,
                metadata={
                    "thread_id": thread_id,
                    "validation": validation_result,
                },
            )


async def resume_research(
    thread_id: str,
    user_id: str,
) -> AsyncGenerator[str, None]:
    """Resume an interrupted run from its last checkpoint."""
    ckpt_thread_id = f"{user_id}:{thread_id}"
    config = {"configurable": {"thread_id": ckpt_thread_id}}

    try:
        # Check if a checkpoint exists
        state = graph.get_state(config)
        if state is None or not getattr(state, "values", None):
            yield error_event(f"No checkpoint found for thread_id={thread_id}")
            return
    except Exception as e:
        yield error_event(f"Could not load checkpoint: {e}")
        return

    yield step_event("resume", f"Resuming from checkpoint — thread_id={thread_id}")

    try:
        loop = asyncio.get_event_loop()

        # Pass None as input to resume from checkpoint
        def _resume_sync():
            return list(graph.stream(None, config=config, stream_mode="updates"))

        chunks = await loop.run_in_executor(None, _resume_sync)

        for chunk in chunks:
            for node_name, updates in chunk.items():
                yield step_event(node_name, _NODE_LABELS.get(node_name, node_name))

        final = graph.get_state(config)
        values = final.values if hasattr(final, "values") else {}
        report = values.get("report", "")
        validation = values.get("validation", {})

        chunk_size = 40
        for i in range(0, len(report), chunk_size):
            yield token_event(report[i: i + chunk_size])
            await asyncio.sleep(0)

        yield final_event(report, validation, thread_id)

    except Exception as e:
        logger.exception(f"Resume failed: {e}")
        yield error_event(str(e))
