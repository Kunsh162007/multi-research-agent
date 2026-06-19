"""
CLI interface for the research assistant.

Usage:
  python -m src.cli --query "What is retrieval-augmented generation?"
  python -m src.cli --query "LLM fine-tuning" --audience technical
  python -m src.cli --resume <thread_id>
  python -m src.cli --list-history
  python -m src.cli --show-history <thread_id>
  python -m src.cli --search-history "safety"
"""

import argparse
import asyncio
import json
import sys
import uuid

from src.history import history_store
from src.runner import resume_research, run_research

# Sentinel user for CLI usage (no OAuth in CLI mode)
_CLI_USER_ID = "cli-user"


def _colour(text: str, code: str) -> str:
    return f"\033[{code}m{text}\033[0m"


def _bold(t):   return _colour(t, "1")
def _cyan(t):   return _colour(t, "36")
def _green(t):  return _colour(t, "32")
def _yellow(t): return _colour(t, "33")
def _dim(t):    return _colour(t, "2")


async def _run(query: str, audience: str, thread_id: str | None):
    print(_bold(f"\n Research Assistant") + _dim(" — streaming mode\n"))
    print(_cyan(f"Query: {query}"))
    print(_dim("─" * 60))

    report_buffer = []
    final_thread_id = thread_id or "?"

    async for raw in run_research(
        query=query,
        user_id=_CLI_USER_ID,
        thread_id=thread_id,
        audience=audience,
    ):
        line = raw.strip()
        if not line.startswith("data:"):
            continue
        try:
            event = json.loads(line[5:].strip())
        except json.JSONDecodeError:
            continue

        t = event.get("type")
        if t == "step":
            print(_yellow(f"  [{event['node']}]") + f" {event['detail']}")
        elif t == "state":
            print(_dim(f"  iteration={event['iteration']}  quality={event['quality']}/100"))
        elif t == "token":
            print(event["text"], end="", flush=True)
            report_buffer.append(event["text"])
        elif t == "final":
            final_thread_id = event.get("thread_id", "?")
            val = event.get("validation", {})
            print(f"\n\n{_dim('─' * 60)}")
            print(_green("Validation:") + f" accuracy={val.get('accuracy')}  completeness={val.get('completeness')}  clarity={val.get('clarity')}  overall={val.get('overall')}")
        elif t == "error":
            print(_colour(f"\nERROR: {event['message']}", "31"), file=sys.stderr)
            return

    print(_dim("─" * 60))
    print(_bold("Thread ID:") + f" {final_thread_id}  (save this to resume or review history)")


async def _resume(thread_id: str):
    print(_bold(f"\nResuming thread: {thread_id}\n"))
    async for raw in resume_research(thread_id=thread_id, user_id=_CLI_USER_ID):
        line = raw.strip()
        if not line.startswith("data:"):
            continue
        try:
            event = json.loads(line[5:].strip())
        except json.JSONDecodeError:
            continue
        t = event.get("type")
        if t == "step":
            print(_yellow(f"  [{event['node']}]") + f" {event['detail']}")
        elif t == "token":
            print(event["text"], end="", flush=True)
        elif t == "final":
            print()
        elif t == "error":
            print(_colour(f"\nERROR: {event['message']}", "31"), file=sys.stderr)


def _list_history():
    convs = history_store.list_conversations(_CLI_USER_ID)
    if not convs:
        print("No conversations found.")
        return
    print(_bold(f"\n{'Thread ID':<40} {'Updated':<25} Title"))
    print(_dim("─" * 100))
    for c in convs:
        print(f"{c['thread_id']:<40} {c['updated_at']:<25} {c['title']}")


def _show_history(thread_id: str):
    messages = history_store.get_messages(thread_id, _CLI_USER_ID)
    if not messages:
        print(f"No messages found for thread {thread_id}")
        return
    for m in messages:
        role_label = _cyan("User:") if m["role"] == "user" else _green("Assistant:")
        print(f"\n{role_label}\n{m['content'][:1000]}")
        if m.get("metadata"):
            print(_dim(f"  metadata: {json.dumps(m['metadata'])}"))


def _search_history(q: str):
    results = history_store.search(_CLI_USER_ID, q)
    if not results:
        print(f"No results for: {q!r}")
        return
    for r in results:
        print(f"\n{_bold(r['thread_id'])} — {r['title']}")
        print(_dim(r["content_preview"]))


def main():
    parser = argparse.ArgumentParser(description="Agentic Research Assistant CLI")
    parser.add_argument("--query", help="Research query to run")
    parser.add_argument("--audience", default="general", help="Target audience (general/technical/academic)")
    parser.add_argument("--thread-id", help="Thread ID (to reuse an existing conversation)")
    parser.add_argument("--resume", metavar="THREAD_ID", help="Resume an interrupted run")
    parser.add_argument("--list-history", action="store_true", help="List recent conversations")
    parser.add_argument("--show-history", metavar="THREAD_ID", help="Show messages for a conversation")
    parser.add_argument("--search-history", metavar="QUERY", help="Search conversation history")
    args = parser.parse_args()

    if args.query:
        asyncio.run(_run(args.query, args.audience, args.thread_id))
    elif args.resume:
        asyncio.run(_resume(args.resume))
    elif args.list_history:
        _list_history()
    elif args.show_history:
        _show_history(args.show_history)
    elif args.search_history:
        _search_history(args.search_history)
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
