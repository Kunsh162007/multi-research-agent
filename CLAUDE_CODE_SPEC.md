# Project Specification: Agentic Research Assistant with Self-RAG

> **Instructions for Claude Code**: This document fully specifies a research assistant system. Build it end-to-end. Generate all files, with clear comments, error handling, and a runnable structure. Use the tech stack specified. Where a design choice is open, prefer simplicity and readability over cleverness.

---

## 1. Project Overview

Build an **agentic research assistant** that autonomously researches a topic and produces a cited report. The agent decides which tools to use (no hardcoded tool-to-question mapping), uses **Self-RAG** to decide *when* to retrieve and *whether* its answer is good enough, and exposes three production features:

1. **Streaming** — token/event output streamed to the user in real time.
2. **Persistence** — agent run state survives restarts (can resume an interrupted run).
3. **Chat history storage** — every conversation is saved and retrievable across sessions.

---

## 2. Tech Stack (use exactly this)

| Concern | Choice |
|---|---|
| Orchestration | LangGraph (`StateGraph`) |
| LLM | Anthropic Claude API (`claude-sonnet-4-6`) |
| Streaming | LangGraph `.stream()` / `.astream_events()` + SSE in API layer |
| Persistence (checkpointing) | LangGraph `SqliteSaver` (or `AsyncSqliteSaver`) |
| Chat history storage | SQLite via a small `HistoryStore` data-access layer |
| API layer | FastAPI with a Server-Sent Events (SSE) endpoint |
| Language | Python 3.10+ |
| Config | `.env` via `python-dotenv` |

Tools the agent can call: `web_search`, `arxiv_search`, `github_search`, `summarize`. Implement `web_search` against a real provider if an API key is present, otherwise a stub that returns clearly-marked placeholder results so the system still runs.

---

## 3. Architecture

```
User query
   │
   ▼
Phase 1: Prompt Enhancement      (clarify → expand → decompose → constraints)
   │
   ▼
Phase 2: Agentic Loop + Self-RAG (the LangGraph graph; streamed; checkpointed)
   │   ├─ decide_retrieval   (Self-RAG: do I need to retrieve?)
   │   ├─ retrieve            (agent picks tool; not pre-assigned)
   │   ├─ grade_relevance     (Self-RAG: keep only relevant docs)
   │   ├─ generate            (draft answer grounded in findings)
   │   ├─ grade_answer        (Self-RAG: is it supported + complete?)
   │   └─ route               (loop back, or move on)
   │
   ▼
Phase 3: Synthesis               (organize, cite, format for audience)
   │
   ▼
Phase 4: Validation              (final quality + completeness score)
   │
   ▼
Output  (streamed) + saved to chat history
```

Each node is a function `(state) -> partial_state`. The graph is compiled **with a checkpointer** so runs are persisted and resumable.

---

## 4. State Definition

Use a `TypedDict` for graph state. Keep it flat and serializable (no live objects, only JSON-friendly values).

```python
from typing import TypedDict, List, Dict, Any, Optional

class ResearchState(TypedDict):
    # identity / threading
    thread_id: str                 # conversation/run id (used for persistence + history)

    # input
    query: str
    user_context: Dict[str, Any]
    constraints: Dict[str, Any]    # e.g. {"max_iterations": 8, "quality_target": 75}

    # phase 1 output
    clarified_query: str
    research_angles: List[str]

    # phase 2 working memory
    iteration: int
    needs_retrieval: bool
    retrieved_docs: List[Dict[str, Any]]   # [{text, source, url, relevance}]
    findings: List[Dict[str, Any]]         # accepted, relevant docs (with citations)
    draft_answer: str
    answer_quality: Dict[str, Any]         # {overall, supported, complete, ...}

    # phase 3/4 output
    report: str
    validation: Dict[str, Any]

    # control
    done: bool
    status: str                    # "running" | "quality_achieved" | "max_iterations" | "error"
    error: Optional[str]
```

---

## 5. Phase Details

### Phase 1 — Prompt Enhancement
Single node `enhance`. Calls the LLM once (or a few times) to produce:
- `clarified_query`: a specific, self-contained version of the user query.
- `research_angles`: 3–5 distinct angles to cover.

Be robust: if the LLM returns malformed JSON, retry once with a stricter instruction; if it still fails, fall back to `clarified_query = query` and `research_angles = [query]`.

### Phase 2 — Agentic Loop with Self-RAG
Implement as **separate LangGraph nodes** (not one mega-function) so streaming shows progress per step:

- **`decide_retrieval`** — Self-RAG gate. LLM answers whether external info is needed given current `findings`. Sets `needs_retrieval`.
- **`retrieve`** — only runs if `needs_retrieval`. The agent (LLM) chooses *which* tool(s) to call and with *what* query. Do not hardcode "angle X → tool Y". Append raw results to `retrieved_docs`.
- **`grade_relevance`** — Self-RAG. Score each retrieved doc RELEVANT / PARTIAL / NOT. Move kept docs into `findings` with a citation record. Discard the rest.
- **`generate`** — draft an answer grounded only in `findings`, with inline citation markers like `[1]`, `[2]`.
- **`grade_answer`** — Self-RAG. Score the draft for *supported* (backed by findings) and *complete* (covers angles). Produce `answer_quality.overall` (0–100).
- **`route`** — conditional edge:
  - if `answer_quality.overall >= quality_target` → go to synthesis;
  - elif `iteration >= max_iterations` → set `status="max_iterations"`, go to synthesis;
  - else → increment `iteration`, loop back to `decide_retrieval`.

### Phase 3 — Synthesis
Node `synthesize`. Turn `findings` + `draft_answer` into a clean report: organized by angle, citations resolved into a reference list, formatted for `user_context.get("audience", "general")`.

### Phase 4 — Validation
Node `validate`. Produce a final `validation = {accuracy, completeness, clarity, overall}`. This is reported to the user but does **not** block output (the agent already self-graded in the loop).

---

## 6. Feature: Streaming

Requirements:
- The graph must be consumed with streaming so the user sees progress as it happens, not just the final answer.
- Stream **two kinds of events**:
  1. **Node/progress events** — e.g. `{"type":"step","node":"retrieve","detail":"searching arxiv: ..."}`.
  2. **Token events** for the final synthesis — stream the report text token-by-token.

Implementation guidance:
- Use `graph.astream_events(..., version="v2")` (or `graph.stream(..., stream_mode="updates")` for node-level updates plus a separate token stream from the synthesis LLM call).
- In the FastAPI layer, expose this as **Server-Sent Events** (`text/event-stream`). Each SSE `data:` line is one JSON event.
- Provide a CLI mode too that prints streamed steps and then streams the final report to stdout.

Define a small, stable event schema so the frontend/CLI can render it:

```python
# every streamed event is one of:
{"type": "step",   "node": str, "detail": str}
{"type": "token",  "text": str}                 # final report tokens
{"type": "state",  "iteration": int, "quality": int}
{"type": "final",  "report": str, "validation": dict, "thread_id": str}
{"type": "error",  "message": str}
```

---

## 7. Feature: Persistence (checkpointing)

Requirements:
- Compile the graph with a **checkpointer** so each step's state is saved.
- Every run is keyed by a `thread_id`. Passing the same `thread_id` again must **resume** from the last checkpoint instead of starting over.
- If the process crashes mid-run, re-invoking with the same `thread_id` continues where it left off.

Implementation guidance:
```python
from langgraph.checkpoint.sqlite import SqliteSaver  # or AsyncSqliteSaver for async

checkpointer = SqliteSaver.from_conn_string("checkpoints.db")
graph = builder.compile(checkpointer=checkpointer)

config = {"configurable": {"thread_id": thread_id}}
result = graph.invoke(initial_state, config=config)   # resumes if thread_id exists
```

- Expose a way to **list** and **resume** existing threads from the CLI/API.
- Document clearly that `checkpoints.db` is the persistence store and is safe to delete to reset.

---

## 8. Feature: Chat History Storage

This is **separate** from checkpointing. Checkpointing stores in-progress graph state; chat history stores the human-readable conversation log for browsing later.

Build a small `HistoryStore` class backed by SQLite with this schema:

```sql
CREATE TABLE IF NOT EXISTS conversations (
    thread_id   TEXT PRIMARY KEY,
    title       TEXT,
    created_at  TEXT,
    updated_at  TEXT
);

CREATE TABLE IF NOT EXISTS messages (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    thread_id   TEXT,
    role        TEXT,          -- "user" | "assistant" | "system"
    content     TEXT,
    metadata    TEXT,          -- JSON: citations, quality score, etc.
    created_at  TEXT,
    FOREIGN KEY (thread_id) REFERENCES conversations(thread_id)
);
```

`HistoryStore` methods:
- `create_conversation(thread_id, title) -> None`
- `add_message(thread_id, role, content, metadata=None) -> None`
- `get_messages(thread_id) -> list[dict]`
- `list_conversations(limit=50) -> list[dict]`  (most recent first)
- `search(query) -> list[dict]`  (simple `LIKE` match on message content; fine for v1)
- `delete_conversation(thread_id) -> None`

Wiring:
- On a new query, create the conversation (title = first ~60 chars of the query) and store the user message.
- After the run completes, store the assistant message with `metadata` = `{citations, validation, quality, iterations}`.
- Provide CLI commands: `--list-history`, `--show-history <thread_id>`, `--search-history <text>`.
- Provide API endpoints mirroring these (see section 10).

> Keep the two SQLite files distinct and clearly named: `checkpoints.db` (LangGraph) and `history.db` (HistoryStore). They can be different files in the same SQLite DB or two files — your choice, but document it.

---

## 9. File / Module Layout

Generate this structure:

```
research-assistant/
├─ README.md
├─ requirements.txt
├─ .env.example                 # ANTHROPIC_API_KEY=, optional search keys
├─ src/
│  ├─ __init__.py
│  ├─ config.py                 # loads env, model name, db paths, defaults
│  ├─ state.py                  # ResearchState TypedDict
│  ├─ llm.py                    # Claude client wrapper (sync + streaming)
│  ├─ tools.py                  # web_search, arxiv_search, github_search, summarize
│  ├─ self_rag.py               # decide_retrieval, grade_relevance, grade_answer
│  ├─ nodes.py                  # enhance, retrieve, generate, synthesize, validate
│  ├─ graph.py                  # builds + compiles StateGraph WITH checkpointer
│  ├─ history.py                # HistoryStore (SQLite)
│  ├─ streaming.py              # event schema + helpers to emit step/token events
│  ├─ runner.py                 # high-level run()/resume() orchestration + history wiring
│  ├─ api.py                    # FastAPI app with SSE streaming + history endpoints
│  └─ cli.py                    # argparse CLI (run, resume, list/show/search history)
└─ tests/
   ├─ test_self_rag.py
   ├─ test_history.py
   └─ test_graph_smoke.py
```

---

## 10. API Surface (FastAPI)

- `POST /research` → body `{query, audience?, thread_id?, constraints?}`. Returns an **SSE stream** of the event schema in section 6. If `thread_id` is omitted, generate one (UUID4) and include it in the first `state`/`final` event.
- `POST /resume` → body `{thread_id}`. Resumes a checkpointed run, streaming the same way.
- `GET  /history` → list recent conversations.
- `GET  /history/{thread_id}` → full message log for a conversation.
- `GET  /history/search?q=...` → search messages.
- `DELETE /history/{thread_id}` → delete a conversation (and optionally its checkpoint).

Return clear JSON errors with appropriate status codes.

---

## 11. CLI Surface

```
python -m src.cli --query "Research AI safety" --audience technical
python -m src.cli --resume <thread_id>
python -m src.cli --list-history
python -m src.cli --show-history <thread_id>
python -m src.cli --search-history "safety"
```

The default run mode prints streamed step events as they arrive, then streams the final report to stdout, then prints the quality score and `thread_id` (so the user can resume or look it up later).

---

## 12. Configuration & Defaults

`config.py` should centralize:
- `ANTHROPIC_API_KEY` (required; fail fast with a clear message if missing)
- `MODEL = "claude-sonnet-4-6"`
- `CHECKPOINT_DB = "checkpoints.db"`, `HISTORY_DB = "history.db"`
- Defaults: `max_iterations = 8`, `quality_target = 75`, `top_k = 5`
- Optional search-provider keys; if absent, `web_search` uses the stub.

---

## 13. Error Handling Requirements

- **LLM/JSON parsing**: wrap structured-output calls; retry once with a stricter prompt; then fall back gracefully.
- **Tool failures / network**: catch, log, mark the doc batch empty, let the agent decide to try a different tool or proceed.
- **Loop safety**: hard cap at `max_iterations`; never allow an infinite loop.
- **Streaming**: if an exception occurs mid-stream, emit an `{"type":"error"}` event and still persist whatever partial state exists.
- **Persistence**: all DB writes wrapped in try/except; a history-write failure must not crash a run.

---

## 14. README Requirements

The generated `README.md` must include:
- One-paragraph description.
- Setup (venv, `pip install -r requirements.txt`, copy `.env.example` → `.env`).
- How to run the CLI and the API.
- How streaming, persistence (resume by `thread_id`), and chat history work, with example commands.
- Note on the two SQLite files and how to reset them.
- A short architecture diagram (ASCII is fine).

---

## 15. Acceptance Criteria (the build is "done" when…)

1. `python -m src.cli --query "What is retrieval-augmented generation?"` runs end-to-end, streams steps, streams a final cited report, and prints a `thread_id`.
2. Killing the process mid-run and re-running `--resume <thread_id>` continues rather than restarting.
3. `--list-history` shows the prior conversation; `--show-history <thread_id>` prints the saved user + assistant messages with metadata.
4. `uvicorn src.api:app` serves `POST /research` as a working SSE stream and the history endpoints return JSON.
5. The agent's tool choice is made at runtime by the model — there is no hardcoded mapping from angle/question to a specific tool.
6. Self-RAG is visibly in effect: logs/events show retrieval decisions, relevance grading, and answer grading driving the loop.
7. `pytest` passes the three smoke tests.

---

## 16. Notes on Style

- Prefer small, single-responsibility functions.
- Comment the *why*, not the obvious *what*.
- Keep prompts in clearly named constants so they're easy to tune.
- No secrets in code; everything via `.env`.
- Make it run with the stub search out of the box so a reviewer with only an Anthropic key can try it immediately.

---

*End of specification. Build the full project per the above. After generating, print a short "how to run" summary.*
