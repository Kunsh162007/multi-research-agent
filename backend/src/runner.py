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
from src.streaming import error_event, final_event, sources_event, state_event, step_event, token_event

logger = logging.getLogger(__name__)

_NODE_LABELS = {
    "enhance": "Decomposing query",
    "decide_retrieval": "Deciding retrieval strategy",
    "retrieve": "Searching sources",
    "grade_relevance": "Grading relevance",
    "generate": "Drafting report",
    "grade_answer": "Quality check",
    "reflect": "Reflecting on gaps",
    "synthesize": "Synthesizing report",
    "validate": "Validating report",
}


async def _stream_graph(
    initial_state: ResearchState,
    config: dict,
) -> AsyncGenerator[str, None]:
    """
    Stream SSE events from the LangGraph run in real time using asyncio.Queue.
    Each node emits its event as soon as it completes, not after the full graph finishes.
    """
    loop = asyncio.get_running_loop()
    queue: asyncio.Queue = asyncio.Queue()

    def _run_sync():
        try:
            for chunk in graph.stream(initial_state, config=config, stream_mode="updates"):
                loop.call_soon_threadsafe(queue.put_nowait, ("chunk", chunk))
        except Exception as exc:
            loop.call_soon_threadsafe(queue.put_nowait, ("error", exc))
        finally:
            loop.call_soon_threadsafe(queue.put_nowait, ("done", None))

    fut = loop.run_in_executor(None, _run_sync)

    error_occurred = False
    while True:
        kind, payload = await queue.get()
        if kind == "error":
            logger.exception(f"Graph streaming error: {payload}")
            yield error_event(str(payload))
            error_occurred = True
            break
        if kind == "done":
            break

        # kind == "chunk"
        for node_name, updates in payload.items():
            label = _NODE_LABELS.get(node_name, node_name)

            if node_name == "retrieve":
                docs = updates.get("retrieved_docs", [])
                num_docs = len(docs)
                detail = f"{label} — {num_docs} documents retrieved"
                yield step_event(node_name, detail)
                # Emit source cards for the UI
                sources = []
                for doc in docs:
                    url = doc.get("url", "")
                    if url:
                        sources.append({
                            "url": url,
                            "title": doc.get("source", ""),
                            "source_type": "web",
                        })
                if sources:
                    yield sources_event(sources)

            elif node_name == "grade_relevance":
                num_accepted = len(updates.get("findings", []))
                detail = f"{label} — {num_accepted} accepted"
                yield step_event(node_name, detail)

            elif node_name == "grade_answer":
                quality = updates.get("answer_quality", {}).get("overall", 0)
                iteration = updates.get("iteration", 0)
                detail = f"{label} — {quality}/100"
                yield step_event(node_name, detail)
                yield state_event(iteration, int(quality))

            else:
                yield step_event(node_name, label)

    await fut  # propagate any unhandled thread exception

    if error_occurred:
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

    # Stream report tokens with typing effect
    chunk_size = 4
    for i in range(0, len(report), chunk_size):
        yield token_event(report[i: i + chunk_size])
        await asyncio.sleep(0.025)

    yield final_event(report, validation, thread_id)


async def run_research(
    query: str,
    user_id: str,
    thread_id: Optional[str] = None,
    audience: str = "general",
    constraints: Optional[dict] = None,
    doc_context: Optional[list] = None,
) -> AsyncGenerator[str, None]:
    thread_id = thread_id or str(uuid.uuid4())
    constraints = constraints or {}

    # Tag each preloaded doc so the retrieve node preserves them
    preloaded = [
        {**d, "preloaded": True, "relevance": d.get("relevance", 1.0)}
        for d in (doc_context or [])
        if d.get("text")
    ]

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
        "retrieved_docs": preloaded,
        "findings": [],
        "draft_answer": "",
        "answer_quality": {},
        "report": "",
        "validation": {},
        "done": False,
        "status": "running",
        "error": None,
    }

    ckpt_thread_id = f"{user_id}:{thread_id}"
    config = {"configurable": {"thread_id": ckpt_thread_id}}

    history_store.create_conversation(thread_id, user_id, query)
    history_store.add_message(thread_id, user_id, "user", query)

    report_parts: list[str] = []
    validation_result: dict = {}

    try:
        async for event_str in _stream_graph(initial_state, config):
            yield event_str
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
        state = graph.get_state(config)
        if state is None or not getattr(state, "values", None):
            yield error_event(f"No checkpoint found for thread_id={thread_id}")
            return
    except Exception as e:
        yield error_event(f"Could not load checkpoint: {e}")
        return

    yield step_event("resume", "Resuming from checkpoint")

    try:
        loop = asyncio.get_running_loop()
        queue: asyncio.Queue = asyncio.Queue()

        def _resume_sync():
            try:
                for chunk in graph.stream(None, config=config, stream_mode="updates"):
                    loop.call_soon_threadsafe(queue.put_nowait, ("chunk", chunk))
            except Exception as exc:
                loop.call_soon_threadsafe(queue.put_nowait, ("error", exc))
            finally:
                loop.call_soon_threadsafe(queue.put_nowait, ("done", None))

        fut = loop.run_in_executor(None, _resume_sync)

        while True:
            kind, payload = await queue.get()
            if kind == "error":
                yield error_event(str(payload))
                await fut
                return
            if kind == "done":
                break
            for node_name, _ in payload.items():
                yield step_event(node_name, _NODE_LABELS.get(node_name, node_name))

        await fut

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
