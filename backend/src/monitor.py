"""
KnowledgeMonitor — tracks AI/research topics per user, fetches new content,
and stores deduplicated knowledge items.

Runs on two triggers:
  1. Scheduled — APScheduler fires every MONITOR_INTERVAL_HOURS (default 24h)
  2. On-demand  — API endpoint calls sync_topic() or sync_user()
"""

import hashlib
import logging
import sqlite3
from datetime import datetime, timedelta, timezone

from apscheduler.schedulers.background import BackgroundScheduler

from src.config import MONITOR_DB, MONITOR_INTERVAL_HOURS, MONITOR_SWEEP_HOURS
from src.tools import arxiv_search, web_search

logger = logging.getLogger(__name__)


class KnowledgeMonitor:
    def __init__(self, db_path: str = MONITOR_DB):
        self.conn = sqlite3.connect(db_path, check_same_thread=False)
        self._init_db()
        self.scheduler = BackgroundScheduler(timezone="UTC")
        self.scheduler.add_job(
            self._scheduled_run,
            trigger="interval",
            hours=MONITOR_SWEEP_HOURS,
            id="monitor_sweep",
            replace_existing=True,
        )

    def _init_db(self):
        self.conn.execute("PRAGMA journal_mode=WAL")
        self.conn.execute("PRAGMA synchronous=NORMAL")
        self.conn.executescript("""
            CREATE TABLE IF NOT EXISTS user_topics (
                id         INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id    TEXT NOT NULL,
                topic      TEXT NOT NULL,
                created_at TEXT NOT NULL,
                sync_interval_hours INTEGER NOT NULL DEFAULT 24,
                UNIQUE(user_id, topic)
            );

            CREATE TABLE IF NOT EXISTS knowledge_items (
                id           INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id      TEXT NOT NULL,
                topic        TEXT NOT NULL,
                title        TEXT NOT NULL,
                content      TEXT NOT NULL,
                source       TEXT NOT NULL,
                url          TEXT NOT NULL,
                content_hash TEXT NOT NULL,
                discovered_at TEXT NOT NULL,
                item_type    TEXT NOT NULL,
                UNIQUE(user_id, content_hash)
            );

            CREATE TABLE IF NOT EXISTS monitor_runs (
                id        INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id   TEXT NOT NULL,
                topic     TEXT NOT NULL,
                ran_at    TEXT NOT NULL,
                new_items INTEGER NOT NULL DEFAULT 0
            );

            -- One synthesized briefing per topic (its own "thread"), refreshed on sync.
            CREATE TABLE IF NOT EXISTS topic_briefings (
                user_id    TEXT NOT NULL,
                topic      TEXT NOT NULL,
                briefing   TEXT NOT NULL,
                refs       TEXT NOT NULL,
                item_count INTEGER NOT NULL DEFAULT 0,
                updated_at TEXT NOT NULL,
                PRIMARY KEY (user_id, topic)
            );
        """)
        # Migration: add sync_interval_hours to pre-existing user_topics tables.
        try:
            self.conn.execute("ALTER TABLE user_topics ADD COLUMN sync_interval_hours INTEGER NOT NULL DEFAULT 24")
        except sqlite3.OperationalError:
            pass  # column already exists
        self.conn.commit()

    def _now(self) -> str:
        return datetime.now(timezone.utc).isoformat()

    # ─── Topic management ─────────────────────────────────────────────────────

    def add_topic(self, user_id: str, topic: str, interval_hours: int = MONITOR_INTERVAL_HOURS) -> bool:
        try:
            interval = max(1, int(interval_hours))
            # Upsert so re-adding a topic updates its sync cadence.
            self.conn.execute(
                "INSERT INTO user_topics (user_id, topic, created_at, sync_interval_hours) "
                "VALUES (?, ?, ?, ?) "
                "ON CONFLICT(user_id, topic) DO UPDATE SET sync_interval_hours=excluded.sync_interval_hours",
                (user_id, topic.strip(), self._now(), interval),
            )
            self.conn.commit()
            return True
        except Exception as e:
            logger.error(f"add_topic failed: {e}")
            return False

    def remove_topic(self, user_id: str, topic: str) -> None:
        self.conn.execute("DELETE FROM user_topics WHERE user_id=? AND topic=?", (user_id, topic))
        self.conn.commit()

    def get_topics(self, user_id: str) -> list[dict]:
        cursor = self.conn.execute(
            "SELECT topic, created_at, sync_interval_hours FROM user_topics WHERE user_id=? ORDER BY created_at DESC",
            (user_id,),
        )
        return [{"topic": r[0], "created_at": r[1], "sync_interval_hours": r[2]} for r in cursor.fetchall()]

    def _due_topics(self, user_id: str) -> list[str]:
        """Topics whose per-topic interval has elapsed since their last sync (or never synced)."""
        rows = self.conn.execute(
            "SELECT topic, sync_interval_hours FROM user_topics WHERE user_id=?", (user_id,)
        ).fetchall()
        now = datetime.now(timezone.utc)
        due = []
        for topic, interval in rows:
            last = self.get_last_run(user_id, topic)
            if not last:
                due.append(topic)
                continue
            try:
                ran_at = datetime.fromisoformat(last["ran_at"])
            except (ValueError, TypeError):
                due.append(topic)
                continue
            if now - ran_at >= timedelta(hours=max(1, interval or MONITOR_INTERVAL_HOURS)):
                due.append(topic)
        return due

    # ─── Content ingestion ────────────────────────────────────────────────────

    def _content_hash(self, url: str, title: str) -> str:
        return hashlib.sha256(f"{url}{title}".encode()).hexdigest()[:32]

    def _store_item(self, user_id: str, topic: str, item: dict, item_type: str) -> bool:
        """Returns True if the item was NEW (not a duplicate)."""
        h = self._content_hash(item.get("url", ""), item.get("source", ""))
        try:
            before = self.conn.execute("SELECT changes()").fetchone()[0]
            self.conn.execute("""
                INSERT OR IGNORE INTO knowledge_items
                    (user_id, topic, title, content, source, url, content_hash, discovered_at, item_type)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                user_id, topic,
                item.get("source", "Unknown")[:200],
                item.get("text", "")[:2000],
                item.get("source", "")[:200],
                item.get("url", "")[:500],
                h,
                self._now(),
                item_type,
            ))
            self.conn.commit()
            after = self.conn.total_changes
            return after > before
        except Exception as e:
            logger.error(f"store_item failed: {e}")
            return False

    def sync_topic(self, user_id: str, topic: str) -> int:
        """Fetch and store new content for one topic. Returns count of new items."""
        from datetime import datetime
        year = datetime.now().year

        new_count = 0

        # Academic papers — use current year for fresh results
        try:
            papers = arxiv_search(f"{topic} {year}", max_results=10)
            for paper in papers:
                if self._store_item(user_id, topic, paper, "arxiv"):
                    new_count += 1
        except Exception as e:
            logger.error(f"arxiv sync failed for topic={topic}: {e}")

        # Web/news — use current year to avoid stale results
        try:
            results = web_search(f"{topic} latest {year}", num_results=5)
            for result in results:
                if self._store_item(user_id, topic, result, "web"):
                    new_count += 1
        except Exception as e:
            logger.error(f"web sync failed for topic={topic}: {e}")

        self.conn.execute(
            "INSERT INTO monitor_runs (user_id, topic, ran_at, new_items) VALUES (?, ?, ?, ?)",
            (user_id, topic, self._now(), new_count),
        )
        self.conn.commit()

        # Refresh the topic's briefing when content changed (or none exists yet).
        if new_count > 0 or self.get_briefing(user_id, topic) is None:
            try:
                self.generate_briefing(user_id, topic)
            except Exception as e:
                logger.error(f"briefing refresh failed for topic={topic}: {e}")

        logger.info(f"Monitor sync: user={user_id} topic={topic!r} new={new_count}")
        return new_count

    def sync_user(self, user_id: str) -> dict[str, int]:
        """Sync all topics for a user. Returns {topic: new_count}."""
        topics = self.get_topics(user_id)
        results = {}
        for t in topics:
            try:
                results[t["topic"]] = self.sync_topic(user_id, t["topic"])
            except Exception as e:
                logger.error(f"sync_user topic={t['topic']} failed: {e}")
                results[t["topic"]] = 0
        return results

    # ─── Query ────────────────────────────────────────────────────────────────

    def get_knowledge_items(self, user_id: str, topic: str = None, limit: int = 50) -> list[dict]:
        if topic:
            cursor = self.conn.execute(
                "SELECT id, topic, title, content, source, url, discovered_at, item_type FROM knowledge_items WHERE user_id=? AND topic=? ORDER BY discovered_at DESC LIMIT ?",
                (user_id, topic, limit),
            )
        else:
            cursor = self.conn.execute(
                "SELECT id, topic, title, content, source, url, discovered_at, item_type FROM knowledge_items WHERE user_id=? ORDER BY discovered_at DESC LIMIT ?",
                (user_id, limit),
            )
        cols = ["id", "topic", "title", "content", "source", "url", "discovered_at", "item_type"]
        return [dict(zip(cols, row)) for row in cursor.fetchall()]

    def get_last_run(self, user_id: str, topic: str) -> dict | None:
        cursor = self.conn.execute(
            "SELECT ran_at, new_items FROM monitor_runs WHERE user_id=? AND topic=? ORDER BY ran_at DESC LIMIT 1",
            (user_id, topic),
        )
        row = cursor.fetchone()
        return {"ran_at": row[0], "new_items": row[1]} if row else None

    # ─── Per-topic technology briefing ────────────────────────────────────────

    _BRIEFING_PROMPT = """You are a technology intelligence analyst. Using ONLY the items below, write a briefing on the LATEST developments and emerging technologies in "{topic}".

Items (cite by number with its link):
{items}

Write in Markdown, concise and specific:

## What's New in {topic}
2-4 sentences on the most important recent developments.

## Key Developments
A bullet for each notable new technology / paper / tool. Each bullet MUST include an inline markdown link to its source, e.g. "- **[Title](url)** — one line on why it matters."

## Why It Matters
2-3 sentences synthesizing the direction the field is moving.

Rules: reference only the items provided, always hyperlink sources inline, no fabricated links."""

    def generate_briefing(self, user_id: str, topic: str, max_items: int = 15) -> dict | None:
        """Synthesize a per-topic briefing from recent knowledge items and persist it."""
        import json as _json
        items = self.get_knowledge_items(user_id, topic=topic, limit=max_items)
        if not items:
            return None

        items_text = "\n".join(
            f"[{i + 1}] {it['title']} ({it['item_type']}) — {it['url']}\n{(it['content'] or '')[:300]}"
            for i, it in enumerate(items)
        )
        # Try the heavy model, fall back to the lighter model / OpenRouter on a rate
        # limit; if every LLM is unavailable, still ship a deterministic briefing so
        # the user always sees something.
        # Full-quality model only (+ cross-provider OpenRouter if configured). We do NOT
        # fall back to a lighter model — better to show the items than a degraded briefing.
        from src.router import resilient_complete
        briefing = resilient_complete(
            self._BRIEFING_PROMPT.format(topic=topic, items=items_text),
            temperature=0.3, max_tokens=2048, roles=("heavy",),
        )
        if not briefing:
            logger.warning(f"generate_briefing: all models unavailable for topic={topic}; using fallback")
            briefing = self._fallback_briefing(topic, items)

        refs = [
            {"title": it["title"], "url": it["url"], "type": it["item_type"]}
            for it in items if it.get("url")
        ]
        now = self._now()
        self.conn.execute("""
            INSERT INTO topic_briefings (user_id, topic, briefing, refs, item_count, updated_at)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(user_id, topic) DO UPDATE SET
                briefing=excluded.briefing, refs=excluded.refs,
                item_count=excluded.item_count, updated_at=excluded.updated_at
        """, (user_id, topic, briefing, _json.dumps(refs), len(items), now))
        self.conn.commit()
        return {"topic": topic, "briefing": briefing, "refs": refs,
                "item_count": len(items), "updated_at": now}

    def _fallback_briefing(self, topic: str, items: list[dict]) -> str:
        """Deterministic briefing from the items alone — used when no LLM is reachable
        (e.g. all providers rate-limited) so a briefing still renders."""
        lines = [
            f"## What's New in {topic}",
            "",
            "_Automated synthesis is temporarily unavailable (model rate limit) — "
            "here are the latest tracked items. Hit ✦ Regenerate later for the full briefing._",
            "",
            "## Key Developments",
        ]
        for it in items:
            title = (it.get("title") or "Untitled").strip()
            url = it.get("url", "")
            kind = it.get("item_type", "source")
            lines.append(f"- **[{title}]({url})** — {kind}" if url else f"- **{title}** — {kind}")
        return "\n".join(lines)

    def get_briefing(self, user_id: str, topic: str) -> dict | None:
        import json as _json
        row = self.conn.execute(
            "SELECT briefing, refs, item_count, updated_at FROM topic_briefings WHERE user_id=? AND topic=?",
            (user_id, topic),
        ).fetchone()
        if not row:
            return None
        return {"topic": topic, "briefing": row[0], "refs": _json.loads(row[1]),
                "item_count": row[2], "updated_at": row[3]}

    def get_all_briefings(self, user_id: str) -> list[dict]:
        import json as _json
        rows = self.conn.execute(
            "SELECT topic, briefing, refs, item_count, updated_at FROM topic_briefings WHERE user_id=? ORDER BY updated_at DESC",
            (user_id,),
        ).fetchall()
        return [
            {"topic": r[0], "briefing": r[1], "refs": _json.loads(r[2]),
             "item_count": r[3], "updated_at": r[4]}
            for r in rows
        ]

    # ─── Digest & visit tracking ──────────────────────────────────────────────

    def _ensure_visits_table(self):
        self.conn.execute("""
            CREATE TABLE IF NOT EXISTS monitor_visits (
                user_id      TEXT PRIMARY KEY,
                last_checked TEXT NOT NULL
            )
        """)
        self.conn.commit()

    def mark_visited(self, user_id: str) -> None:
        self._ensure_visits_table()
        self.conn.execute("""
            INSERT INTO monitor_visits(user_id, last_checked) VALUES(?,?)
            ON CONFLICT(user_id) DO UPDATE SET last_checked=excluded.last_checked
        """, (user_id, self._now()))
        self.conn.commit()

    def get_digest(self, user_id: str) -> dict:
        """Return knowledge items discovered since the user's last visit, grouped by topic."""
        self._ensure_visits_table()
        row = self.conn.execute("SELECT last_checked FROM monitor_visits WHERE user_id=?", (user_id,)).fetchone()
        since = row[0] if row else "1970-01-01T00:00:00+00:00"

        rows = self.conn.execute("""
            SELECT id, topic, title, url, discovered_at, item_type FROM knowledge_items
            WHERE user_id=? AND discovered_at > ? ORDER BY discovered_at DESC LIMIT 100
        """, (user_id, since)).fetchall()

        cols = ["id", "topic", "title", "url", "discovered_at", "item_type"]
        items = [dict(zip(cols, r)) for r in rows]

        grouped: dict[str, list] = {}
        for item in items:
            grouped.setdefault(item["topic"], []).append(item)

        return {"since": since, "total_new": len(items), "by_topic": grouped}

    def get_new_count(self, user_id: str) -> int:
        """Quick count of new items since last visit — used for notification badge."""
        self._ensure_visits_table()
        row = self.conn.execute("SELECT last_checked FROM monitor_visits WHERE user_id=?", (user_id,)).fetchone()
        since = row[0] if row else "1970-01-01T00:00:00+00:00"
        count = self.conn.execute(
            "SELECT COUNT(*) FROM knowledge_items WHERE user_id=? AND discovered_at > ?", (user_id, since)
        ).fetchone()[0]
        return count

    def get_new_counts_by_topic(self, user_id: str) -> dict[str, int]:
        """New items per topic since last visit — powers per-topic 'NEW' badges."""
        self._ensure_visits_table()
        row = self.conn.execute("SELECT last_checked FROM monitor_visits WHERE user_id=?", (user_id,)).fetchone()
        since = row[0] if row else "1970-01-01T00:00:00+00:00"
        rows = self.conn.execute(
            "SELECT topic, COUNT(*) FROM knowledge_items WHERE user_id=? AND discovered_at > ? GROUP BY topic",
            (user_id, since),
        ).fetchall()
        return {r[0]: r[1] for r in rows}

    # ─── Ask-the-briefing Q&A ─────────────────────────────────────────────────

    _ASK_PROMPT = """You are a research assistant answering a question about "{topic}" using ONLY the tracked sources below.

Sources (cite by number, hyperlinked):
{items}

Question: {question}

Answer the question DIRECTLY in the first sentence, then add only the relevant supporting detail.
Cite sources inline as markdown links. If the sources don't cover it, say so plainly. No fabricated links."""

    def ask_briefing(self, user_id: str, topic: str, question: str, max_items: int = 15) -> dict:
        """Answer a follow-up question grounded in a topic's tracked sources."""
        items = self.get_knowledge_items(user_id, topic=topic, limit=max_items)
        if not items:
            return {"answer": "No sources tracked for this topic yet — sync it first."}
        items_text = "\n".join(
            f"[{i + 1}] {it['title']} ({it['item_type']}) — {it['url']}\n{(it['content'] or '')[:300]}"
            for i, it in enumerate(items)
        )
        from src.router import resilient_complete
        answer = resilient_complete(
            self._ASK_PROMPT.format(topic=topic, items=items_text, question=question),
            temperature=0.2, max_tokens=1536, roles=("heavy",),
        )
        return {"answer": answer or "Sorry — all models are rate-limited right now. Please try again shortly."}

    # ─── Job post → topics ────────────────────────────────────────────────────

    _JOB_TOPIC_PROMPT = """You are a career intelligence expert. Identify 6-8 broad technical domains someone should monitor to stay competitive.

Context:
- Job Position: {job_position}
- Company: {company_name} ({company_type})
- Job Description: {job_description}

Company-type guidance:
- MNC: include enterprise scale, compliance, global trends, industry standards
- Startup: include emerging tech, rapid iteration, open-source ecosystem, funding trends
- Organization/NGO: include policy, impact measurement, sustainability, sector-specific tech
- Other: infer from position and description

Rules for topics:
- Broad, human-readable domain names (2-5 words), NOT paper titles or narrow techniques
- Think: conference track or textbook chapter level (e.g. "LLM Inference Optimization", "AI Agent Orchestration")
- Each topic must be meaningfully distinct — no overlap
- Tailor specifically to the company type and role, not generic AI topics

Return ONLY valid JSON:
{{"topics": ["Domain 1", "Domain 2", ...], "role_summary": "one-line role + company description"}}"""

    def analyze_job_post(self, ctx: dict) -> dict:
        """Use LLM to extract monitoring topics from job context dict."""
        import json as _json
        try:
            from src.llm import get_llm
            prompt = self._JOB_TOPIC_PROMPT.format(
                job_position=ctx.get("job_position", "Not specified"),
                company_name=ctx.get("company_name", "Not specified"),
                company_type=ctx.get("company_type", "other").upper(),
                job_description=ctx.get("job_description", "")[:2000],
            )
            response = get_llm(temperature=0.2).invoke(prompt)
            text = response.content.strip()
            if text.startswith("```"):
                parts = text.split("```")
                text = parts[1] if len(parts) > 1 else text
                if text.startswith("json"): text = text[4:]
            result = _json.loads(text.strip())
            topics = result.get("topics", [])
            role = result.get("role_summary", "")
            return {"topics": [t.strip() for t in topics if t.strip()], "role_summary": role}
        except Exception as e:
            logger.error(f"analyze_job_post failed: {e}")
            return {"topics": [], "role_summary": ""}

    def add_topics_from_job(self, user_id: str, ctx: dict) -> dict:
        """Analyze job context and add extracted topics to the user's monitor list."""
        result = self.analyze_job_post(ctx)
        added = []
        for topic in result.get("topics", []):
            if self.add_topic(user_id, topic):
                added.append(topic)
        return {"added": added, "role_summary": result.get("role_summary", ""), "total": len(added)}

    # ─── Lifecycle ────────────────────────────────────────────────────────────

    def _scheduled_run(self):
        """Sweep wakes hourly; sync only the topics whose per-topic interval has elapsed."""
        from src.email_notify import send_monitor_digest
        from src.history import history_store

        cursor = self.conn.execute("SELECT DISTINCT user_id FROM user_topics")
        for (user_id,) in cursor.fetchall():
            due = self._due_topics(user_id)
            if not due:
                continue
            logger.info(f"Monitor sweep: user={user_id} syncing {len(due)} due topic(s)")
            total_new = 0
            for topic in due:
                try:
                    total_new += self.sync_topic(user_id, topic)
                except Exception as e:
                    logger.error(f"scheduled sync failed user={user_id} topic={topic}: {e}")
            if total_new > 0:
                user = history_store.get_user(user_id)
                if user and user.get("email"):
                    digest = self.get_digest(user_id)
                    send_monitor_digest(user["email"], digest)

    def start(self):
        if not self.scheduler.running:
            self.scheduler.start()
            logger.info(f"Monitor scheduler started (sweep every {MONITOR_SWEEP_HOURS}h, per-topic intervals)")

    def stop(self):
        if self.scheduler.running:
            self.scheduler.shutdown(wait=False)


monitor = KnowledgeMonitor()
