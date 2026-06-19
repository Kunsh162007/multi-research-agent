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
from datetime import datetime, timezone

from apscheduler.schedulers.background import BackgroundScheduler

from src.config import MONITOR_DB, MONITOR_INTERVAL_HOURS
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
            hours=MONITOR_INTERVAL_HOURS,
            id="monitor_sweep",
            replace_existing=True,
        )

    def _init_db(self):
        self.conn.executescript("""
            CREATE TABLE IF NOT EXISTS user_topics (
                id         INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id    TEXT NOT NULL,
                topic      TEXT NOT NULL,
                created_at TEXT NOT NULL,
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
        """)
        self.conn.commit()

    def _now(self) -> str:
        return datetime.now(timezone.utc).isoformat()

    # ─── Topic management ─────────────────────────────────────────────────────

    def add_topic(self, user_id: str, topic: str) -> bool:
        try:
            self.conn.execute(
                "INSERT OR IGNORE INTO user_topics (user_id, topic, created_at) VALUES (?, ?, ?)",
                (user_id, topic.strip(), self._now()),
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
            "SELECT topic, created_at FROM user_topics WHERE user_id=? ORDER BY created_at DESC",
            (user_id,),
        )
        return [{"topic": r[0], "created_at": r[1]} for r in cursor.fetchall()]

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
        new_count = 0

        # Academic papers
        try:
            papers = arxiv_search(f"{topic} recent advances 2024 2025", max_results=10)
            for paper in papers:
                if self._store_item(user_id, topic, paper, "arxiv"):
                    new_count += 1
        except Exception as e:
            logger.error(f"arxiv sync failed for topic={topic}: {e}")

        # Web/news
        try:
            results = web_search(f"{topic} new technique breakthrough 2025", num_results=5)
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

    # ─── Lifecycle ────────────────────────────────────────────────────────────

    def _scheduled_run(self):
        logger.info("Monitor scheduled sweep starting…")
        cursor = self.conn.execute("SELECT DISTINCT user_id FROM user_topics")
        for (user_id,) in cursor.fetchall():
            self.sync_user(user_id)

    def start(self):
        if not self.scheduler.running:
            self.scheduler.start()
            logger.info(f"Monitor scheduler started (interval={MONITOR_INTERVAL_HOURS}h)")

    def stop(self):
        if self.scheduler.running:
            self.scheduler.shutdown(wait=False)


monitor = KnowledgeMonitor()
