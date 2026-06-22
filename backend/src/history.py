import json, logging, sqlite3, secrets
from datetime import datetime, timezone
from src.config import HISTORY_DB

logger = logging.getLogger(__name__)


class HistoryStore:
    def __init__(self, db_path: str = HISTORY_DB):
        self.conn = sqlite3.connect(db_path, check_same_thread=False)
        self._init_db()

    def _init_db(self):
        # WAL mode: allows concurrent reads while writes are in progress
        self.conn.execute("PRAGMA journal_mode=WAL")
        self.conn.execute("PRAGMA synchronous=NORMAL")
        self.conn.execute("PRAGMA foreign_keys=ON")
        self.conn.executescript("""
            CREATE TABLE IF NOT EXISTS users (
                google_id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL,
                name TEXT, picture TEXT, created_at TEXT, last_login TEXT
            );
            CREATE TABLE IF NOT EXISTS conversations (
                thread_id TEXT, user_id TEXT NOT NULL, title TEXT,
                created_at TEXT, updated_at TEXT, PRIMARY KEY (thread_id, user_id)
            );
            CREATE TABLE IF NOT EXISTS messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT, thread_id TEXT,
                user_id TEXT NOT NULL, role TEXT, content TEXT,
                metadata TEXT, created_at TEXT,
                FOREIGN KEY (thread_id, user_id) REFERENCES conversations(thread_id, user_id)
            );
            CREATE TABLE IF NOT EXISTS conversation_tags (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                thread_id TEXT NOT NULL, user_id TEXT NOT NULL, tag TEXT NOT NULL,
                created_at TEXT NOT NULL, UNIQUE(thread_id, user_id, tag)
            );
            CREATE TABLE IF NOT EXISTS shared_reports (
                token TEXT PRIMARY KEY, thread_id TEXT NOT NULL,
                user_id TEXT NOT NULL, title TEXT, report TEXT NOT NULL,
                created_at TEXT NOT NULL, views INTEGER DEFAULT 0
            );
        """)
        self.conn.commit()

    def _now(self): return datetime.now(timezone.utc).isoformat()

    # ── Users ──────────────────────────────────────────────────────────────────
    def upsert_user(self, google_id, email, name, picture):
        now = self._now()
        try:
            self.conn.execute("""
                INSERT INTO users (google_id,email,name,picture,created_at,last_login) VALUES(?,?,?,?,?,?)
                ON CONFLICT(google_id) DO UPDATE SET name=excluded.name,picture=excluded.picture,last_login=excluded.last_login
            """, (google_id, email, name, picture, now, now))
            self.conn.commit()
        except Exception:
            logger.exception("upsert_user failed for %s", google_id)

    def get_user(self, google_id):
        r = self.conn.execute("SELECT google_id,email,name,picture,created_at,last_login FROM users WHERE google_id=?", (google_id,)).fetchone()
        return dict(zip(["google_id","email","name","picture","created_at","last_login"], r)) if r else None

    # ── Conversations ──────────────────────────────────────────────────────────
    def create_conversation(self, thread_id, user_id, title):
        try:
            now = self._now()
            self.conn.execute("INSERT OR IGNORE INTO conversations VALUES(?,?,?,?,?)", (thread_id, user_id, title[:60], now, now))
            self.conn.commit()
        except Exception:
            logger.exception("create_conversation failed for thread %s", thread_id)

    def add_message(self, thread_id, user_id, role, content, metadata=None):
        try:
            self.conn.execute("INSERT INTO messages(thread_id,user_id,role,content,metadata,created_at) VALUES(?,?,?,?,?,?)",
                (thread_id, user_id, role, content, json.dumps(metadata) if metadata else None, self._now()))
            self.conn.execute("UPDATE conversations SET updated_at=? WHERE thread_id=? AND user_id=?", (self._now(), thread_id, user_id))
            self.conn.commit()
        except Exception:
            logger.exception("add_message failed for thread %s", thread_id)

    def get_messages(self, thread_id, user_id):
        rows = self.conn.execute("SELECT role,content,metadata,created_at FROM messages WHERE thread_id=? AND user_id=? ORDER BY id", (thread_id, user_id)).fetchall()
        return [{"role":r[0],"content":r[1],"metadata":json.loads(r[2]) if r[2] else None,"created_at":r[3]} for r in rows]

    def list_conversations(self, user_id, limit=50, tag=None):
        if tag:
            rows = self.conn.execute("""
                SELECT c.thread_id,c.title,c.created_at,c.updated_at FROM conversations c
                JOIN conversation_tags t ON c.thread_id=t.thread_id AND c.user_id=t.user_id
                WHERE c.user_id=? AND t.tag=? ORDER BY c.updated_at DESC LIMIT ?
            """, (user_id, tag, limit)).fetchall()
        else:
            rows = self.conn.execute("SELECT thread_id,title,created_at,updated_at FROM conversations WHERE user_id=? ORDER BY updated_at DESC LIMIT ?", (user_id, limit)).fetchall()
        return [{"thread_id":r[0],"title":r[1],"created_at":r[2],"updated_at":r[3]} for r in rows]

    def search(self, user_id, query):
        rows = self.conn.execute("""
            SELECT DISTINCT m.thread_id,c.title,m.content FROM messages m
            JOIN conversations c ON m.thread_id=c.thread_id AND m.user_id=c.user_id
            WHERE m.user_id=? AND m.content LIKE ? LIMIT 50
        """, (user_id, f"%{query}%")).fetchall()
        return [{"thread_id":r[0],"title":r[1],"content_preview":r[2][:200]} for r in rows]

    def search_bm25(self, user_id, query):
        """BM25-ranked search over all messages."""
        try:
            from rank_bm25 import BM25Okapi
            rows = self.conn.execute(
                "SELECT m.thread_id,c.title,m.content FROM messages m JOIN conversations c ON m.thread_id=c.thread_id AND m.user_id=c.user_id WHERE m.user_id=? AND m.role='assistant'",
                (user_id,)
            ).fetchall()
            if not rows: return []
            corpus = [r[2] for r in rows]
            tokenized = [doc.lower().split() for doc in corpus]
            bm25 = BM25Okapi(tokenized)
            scores = bm25.get_scores(query.lower().split())
            ranked = sorted(zip(scores, rows), reverse=True, key=lambda x: x[0])
            seen = set()
            results = []
            for score, row in ranked[:20]:
                if score <= 0 or row[0] in seen: continue
                seen.add(row[0])
                results.append({"thread_id":row[0],"title":row[1],"content_preview":row[2][:200],"score":round(score,3)})
            return results[:10]
        except ImportError:
            return self.search(user_id, query)

    def delete_conversation(self, thread_id, user_id):
        for tbl in ["messages","conversation_tags"]:
            self.conn.execute(f"DELETE FROM {tbl} WHERE thread_id=? AND user_id=?", (thread_id, user_id))
        self.conn.execute("DELETE FROM conversations WHERE thread_id=? AND user_id=?", (thread_id, user_id))
        self.conn.execute("DELETE FROM shared_reports WHERE thread_id=? AND user_id=?", (thread_id, user_id))
        self.conn.commit()

    # ── Tags ───────────────────────────────────────────────────────────────────
    def add_tag(self, thread_id, user_id, tag):
        try:
            self.conn.execute("INSERT OR IGNORE INTO conversation_tags(thread_id,user_id,tag,created_at) VALUES(?,?,?,?)", (thread_id, user_id, tag.strip()[:30], self._now()))
            self.conn.commit()
        except Exception: pass

    def remove_tag(self, thread_id, user_id, tag):
        self.conn.execute("DELETE FROM conversation_tags WHERE thread_id=? AND user_id=? AND tag=?", (thread_id, user_id, tag))
        self.conn.commit()

    def get_tags(self, thread_id, user_id):
        return [r[0] for r in self.conn.execute("SELECT tag FROM conversation_tags WHERE thread_id=? AND user_id=?", (thread_id, user_id)).fetchall()]

    def get_all_tags(self, user_id):
        rows = self.conn.execute("SELECT tag, COUNT(*) as cnt FROM conversation_tags WHERE user_id=? GROUP BY tag ORDER BY cnt DESC", (user_id,)).fetchall()
        return [{"tag":r[0],"count":r[1]} for r in rows]

    # ── Sharing ────────────────────────────────────────────────────────────────
    def create_share(self, thread_id, user_id, report, title):
        token = secrets.token_urlsafe(24)
        self.conn.execute("INSERT OR REPLACE INTO shared_reports(token,thread_id,user_id,title,report,created_at) VALUES(?,?,?,?,?,?)",
            (token, thread_id, user_id, title, report, self._now()))
        self.conn.commit()
        return token

    def get_share(self, token):
        r = self.conn.execute("SELECT token,thread_id,title,report,created_at,views FROM shared_reports WHERE token=?", (token,)).fetchone()
        if not r: return None
        self.conn.execute("UPDATE shared_reports SET views=views+1 WHERE token=?", (token,))
        self.conn.commit()
        return {"token":r[0],"thread_id":r[1],"title":r[2],"report":r[3],"created_at":r[4],"views":r[5]+1}

    def revoke_share(self, thread_id, user_id):
        self.conn.execute("DELETE FROM shared_reports WHERE thread_id=? AND user_id=?", (thread_id, user_id))
        self.conn.commit()

    def get_share_token(self, thread_id, user_id):
        r = self.conn.execute("SELECT token,views FROM shared_reports WHERE thread_id=? AND user_id=?", (thread_id, user_id)).fetchone()
        return {"token":r[0],"views":r[1]} if r else None

    # ── Stats ──────────────────────────────────────────────────────────────────
    def get_stats(self, user_id):
        total_convs = self.conn.execute("SELECT COUNT(*) FROM conversations WHERE user_id=?", (user_id,)).fetchone()[0]
        total_msgs  = self.conn.execute("SELECT COUNT(*) FROM messages WHERE user_id=? AND role='assistant'", (user_id,)).fetchone()[0]
        total_tags  = self.conn.execute("SELECT COUNT(DISTINCT tag) FROM conversation_tags WHERE user_id=?", (user_id,)).fetchone()[0]
        recent = self.conn.execute("SELECT title,updated_at FROM conversations WHERE user_id=? ORDER BY updated_at DESC LIMIT 5", (user_id,)).fetchall()
        top_tags = self.get_all_tags(user_id)[:5]
        # Activity by day (last 14 days)
        activity = self.conn.execute("""
            SELECT DATE(created_at) as day, COUNT(*) FROM conversations WHERE user_id=?
            AND created_at >= DATE('now','-14 days') GROUP BY day ORDER BY day
        """, (user_id,)).fetchall()
        return {
            "total_conversations": total_convs,
            "total_reports": total_msgs,
            "total_tags": total_tags,
            "recent": [{"title":r[0],"updated_at":r[1]} for r in recent],
            "top_tags": top_tags,
            "activity": [{"date":r[0],"count":r[1]} for r in activity],
        }


history_store = HistoryStore()
