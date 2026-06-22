import asyncio, logging, threading, time
from collections import defaultdict, deque
from typing import Optional
import jwt as pyjwt
from fastapi import Depends, FastAPI, File, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from fastapi.responses import StreamingResponse, Response, HTMLResponse, JSONResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
import os

from src.auth import create_jwt, decode_jwt, verify_google_token
from src.config import CORS_ORIGINS
from src.history import history_store
from src.monitor import monitor
from src.runner import resume_research, run_research

# ── Structured logging ─────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)-8s %(name)s — %(message)s",
    datefmt="%Y-%m-%dT%H:%M:%S",
)
logger = logging.getLogger(__name__)

app = FastAPI(title="IntelLab Research API", version="2.0.0", docs_url=None, redoc_url=None)

_UPLOAD_MAX_BYTES = 10 * 1024 * 1024  # 10 MB

# ── Security headers middleware ────────────────────────────────────────────────
class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "SAMEORIGIN"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
        # Don't cache API responses
        if request.url.path.startswith("/") and not request.url.path.startswith("/assets"):
            response.headers.setdefault("Cache-Control", "no-store, no-cache, must-revalidate")
        return response

# ── In-memory rate limiter (sliding window, thread-safe) ──────────────────────
_rate_buckets: dict = defaultdict(deque)
_rate_lock = threading.Lock()

def _rate_check(key: str, max_calls: int, window_seconds: int) -> bool:
    now = time.monotonic()
    with _rate_lock:
        q = _rate_buckets[key]
        while q and q[0] < now - window_seconds:
            q.popleft()
        if len(q) >= max_calls:
            return False
        q.append(now)
        return True


def _compact_context(text: str, max_chars: int = 3000) -> str:
    if len(text) <= max_chars:
        return text
    half = max_chars // 2
    omitted = len(text) - max_chars
    return text[:half] + f"\n…[{omitted} chars omitted]…\n" + text[-half:]

app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(CORSMiddleware, allow_origins=CORS_ORIGINS, allow_credentials=True, allow_methods=["GET","POST","DELETE","OPTIONS"], allow_headers=["Authorization","Content-Type"])

_bearer = HTTPBearer()

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(_bearer)) -> dict:
    try: return decode_jwt(credentials.credentials)
    except pyjwt.ExpiredSignatureError: raise HTTPException(401, "Token expired")
    except pyjwt.InvalidTokenError:    raise HTTPException(401, "Invalid token")

# ── Global exception handler ───────────────────────────────────────────────────
@app.exception_handler(Exception)
async def _global_exc_handler(request: Request, exc: Exception):
    logger.error("Unhandled exception %s %s — %r", request.method, request.url.path, exc, exc_info=True)
    return JSONResponse(status_code=500, content={"detail": "Internal server error"})

# ── Request models with validation ────────────────────────────────────────────
class GoogleAuthRequest(BaseModel):
    credential: str = Field(..., min_length=10, max_length=4096)

class ResearchRequest(BaseModel):
    query: str = Field(..., min_length=1, max_length=2000)
    audience: Optional[str] = Field("general", max_length=50)
    thread_id: Optional[str] = Field(None, max_length=128)
    constraints: Optional[dict] = None
    doc_context: Optional[list] = []

class AddTopicRequest(BaseModel):
    topic: str = Field(..., min_length=1, max_length=200)
    sync_interval_hours: int = Field(24, ge=1, le=720)

class JobPostRequest(BaseModel):
    job_description: str = Field("", max_length=5000)
    job_position:   str = Field("", max_length=300)
    company_name:   str = Field("", max_length=200)
    company_type:   str = Field("other", max_length=20)
    auto_add: bool = False

class TagRequest(BaseModel):
    tag: str = Field(..., min_length=1, max_length=50)

class AskBriefingRequest(BaseModel):
    question: str = Field(..., min_length=1, max_length=500)

# ── Auth ───────────────────────────────────────────────────────────────────────
@app.post("/auth/google")
async def auth_google(request: Request, body: GoogleAuthRequest):
    ip = (request.client.host if request.client else "unknown")
    if not _rate_check(f"auth:{ip}", 10, 60):
        raise HTTPException(429, "Too many login attempts — wait a minute.")
    try: user_info = verify_google_token(body.credential)
    except ValueError as e: raise HTTPException(401, str(e))
    history_store.upsert_user(**user_info)
    return {"access_token": create_jwt(user_info), "token_type": "bearer", "user": user_info}

@app.get("/auth/me")
async def auth_me(user: dict = Depends(get_current_user)): return user

# ── Research ───────────────────────────────────────────────────────────────────
@app.post("/research")
async def research(body: ResearchRequest, user: dict = Depends(get_current_user)):
    if not _rate_check(f"research:{user['google_id']}", 30, 60):
        raise HTTPException(429, "Rate limit exceeded — try again shortly.")
    async def gen():
        async for e in run_research(body.query, user["google_id"], body.thread_id, body.audience or "general", body.constraints, body.doc_context or []):
            yield e
    return StreamingResponse(gen(), media_type="text/event-stream")

@app.post("/fetch-url")
async def fetch_url_endpoint(request: Request, user: dict = Depends(get_current_user)):
    data = await request.json()
    url = (data.get("url") or "").strip()
    if not url:
        raise HTTPException(400, "url is required")
    from src.tools import fetch_url
    docs = fetch_url(url)
    if not docs:
        raise HTTPException(422, "Could not extract content from that URL")
    return {"url": url, "chunks": len(docs), "docs": docs}

@app.post("/deep-search")
async def deep_search_endpoint(request: Request, user: dict = Depends(get_current_user)):
    """Web-wide deep search: SearXNG across every engine, then follow links (BFS crawl)."""
    if not _rate_check(f"deepsearch:{user['google_id']}", 10, 60):
        raise HTTPException(429, "Deep-search rate limit — wait a moment.")
    data = await request.json()
    query = (data.get("query") or "").strip()
    if not query:
        raise HTTPException(400, "query is required")
    from src.tools import deep_crawl
    docs = await asyncio.get_event_loop().run_in_executor(None, deep_crawl, query)
    return {"query": query, "pages": len(docs), "docs": docs}

@app.post("/resume/{thread_id}")
async def resume(thread_id: str, user: dict = Depends(get_current_user)):
    async def gen():
        async for e in resume_research(thread_id, user["google_id"]): yield e
    return StreamingResponse(gen(), media_type="text/event-stream")

# ── File Upload ────────────────────────────────────────────────────────────────
@app.post("/upload")
async def upload_file(
    file: UploadFile = File(...),
    user: dict = Depends(get_current_user),
):
    content = await file.read()
    if len(content) > _UPLOAD_MAX_BYTES:
        raise HTTPException(413, "File too large — max 10 MB")
    from src.file_processor import process_file
    try:
        chunks = process_file(content, file.filename or "upload")
    except (ValueError, RuntimeError) as e:
        raise HTTPException(400, str(e))
    return {"filename": file.filename, "chunks": len(chunks), "docs": chunks}

# ── History ────────────────────────────────────────────────────────────────────
@app.get("/history")
async def list_history(tag: Optional[str] = None, user: dict = Depends(get_current_user)):
    return history_store.list_conversations(user["google_id"], tag=tag)

@app.get("/history/search")
async def search_history(q: str, smart: bool = True, user: dict = Depends(get_current_user)):
    if smart: return history_store.search_bm25(user["google_id"], q)
    return history_store.search(user["google_id"], q)

@app.get("/history/tags")
async def all_tags(user: dict = Depends(get_current_user)):
    return history_store.get_all_tags(user["google_id"])

@app.get("/history/{thread_id}")
async def get_history(thread_id: str, user: dict = Depends(get_current_user)):
    msgs = history_store.get_messages(thread_id, user["google_id"])
    if not msgs: raise HTTPException(404, "Conversation not found")
    tags = history_store.get_tags(thread_id, user["google_id"])
    share = history_store.get_share_token(thread_id, user["google_id"])
    return {"thread_id": thread_id, "messages": msgs, "tags": tags, "share": share}

@app.delete("/history/{thread_id}")
async def delete_history(thread_id: str, user: dict = Depends(get_current_user)):
    history_store.delete_conversation(thread_id, user["google_id"])
    return {"deleted": thread_id}

# ── Tags ───────────────────────────────────────────────────────────────────────
@app.get("/history/{thread_id}/tags")
async def get_tags(thread_id: str, user: dict = Depends(get_current_user)):
    return history_store.get_tags(thread_id, user["google_id"])

@app.post("/history/{thread_id}/tags")
async def add_tag(thread_id: str, body: TagRequest, user: dict = Depends(get_current_user)):
    history_store.add_tag(thread_id, user["google_id"], body.tag)
    return {"added": body.tag}

@app.delete("/history/{thread_id}/tags/{tag}")
async def remove_tag(thread_id: str, tag: str, user: dict = Depends(get_current_user)):
    history_store.remove_tag(thread_id, user["google_id"], tag)
    return {"removed": tag}

# ── Suggestions ────────────────────────────────────────────────────────────────
@app.get("/history/{thread_id}/suggestions")
async def get_suggestions(thread_id: str, user: dict = Depends(get_current_user)):
    msgs = history_store.get_messages(thread_id, user["google_id"])
    for m in reversed(msgs):
        if m["role"] == "assistant":
            meta = m.get("metadata") or {}
            if "follow_up_questions" in (meta.get("validation") or {}):
                return {"questions": meta["validation"]["follow_up_questions"]}
    return {"questions": []}

# ── Export ─────────────────────────────────────────────────────────────────────
@app.get("/history/{thread_id}/export")
async def export_report(thread_id: str, format: str = "md", style: str = "report", user: dict = Depends(get_current_user)):
    msgs = history_store.get_messages(thread_id, user["google_id"])
    if not msgs: raise HTTPException(404, "Not found")

    convs = history_store.list_conversations(user["google_id"])
    title = next((c["title"] for c in convs if c["thread_id"] == thread_id), "Research Report")
    query = next((m["content"] for m in msgs if m["role"] == "user"), "")
    report = next((m["content"] for m in reversed(msgs) if m["role"] == "assistant"), "")
    # Extract findings from metadata
    findings = []
    for m in reversed(msgs):
        if m["role"] == "assistant" and m.get("metadata"):
            findings = m["metadata"].get("findings", [])
            break

    from src.export_report import to_markdown, to_pdf, to_docx, to_bibtex
    if format == "pdf":
        data = to_pdf(title, query, report, style=style)
        if not data: raise HTTPException(500, "PDF export unavailable. Run: pip install weasyprint fpdf2")
        return Response(content=data, media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="{thread_id[:8]}.pdf"'})
    elif format == "docx":
        data = to_docx(title, query, report, style=style)
        if not data: raise HTTPException(500, "DOCX export unavailable. Run: pip install python-docx")
        return Response(content=data,
            media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            headers={"Content-Disposition": f'attachment; filename="{thread_id[:8]}.docx"'})
    elif format == "bib":
        data = to_bibtex(findings)
        return Response(content=data, media_type="text/plain",
            headers={"Content-Disposition": f'attachment; filename="{thread_id[:8]}.bib"'})
    else:
        data = to_markdown(title, query, report)
        return Response(content=data, media_type="text/markdown",
            headers={"Content-Disposition": f'attachment; filename="{thread_id[:8]}.md"'})

# ── Sharing ────────────────────────────────────────────────────────────────────
@app.post("/history/{thread_id}/share")
async def share_report(thread_id: str, request: Request, user: dict = Depends(get_current_user)):
    msgs = history_store.get_messages(thread_id, user["google_id"])
    if not msgs: raise HTTPException(404, "Not found")
    convs = history_store.list_conversations(user["google_id"])
    title = next((c["title"] for c in convs if c["thread_id"] == thread_id), "Research Report")
    report = next((m["content"] for m in reversed(msgs) if m["role"] == "assistant"), "")
    token = history_store.create_share(thread_id, user["google_id"], report, title)
    base = str(request.base_url).rstrip("/")
    return {"token": token, "url": f"{base}/share/{token}"}

@app.delete("/history/{thread_id}/share")
async def revoke_share(thread_id: str, user: dict = Depends(get_current_user)):
    history_store.revoke_share(thread_id, user["google_id"])
    return {"revoked": thread_id}

@app.get("/share/{token}")
async def public_share(token: str):
    """Public endpoint — no auth required. Returns a self-contained HTML page."""
    data = history_store.get_share(token)
    if not data: raise HTTPException(404, "Share link not found or expired")
    import markdown as md_lib
    try:
        body_html = md_lib.markdown(data["report"], extensions=["tables","fenced_code"])
    except ImportError:
        body_html = f"<pre>{data['report']}</pre>"
    html = f"""<!doctype html><html><head><meta charset='utf-8'>
<title>{data['title']}</title>
<style>body{{max-width:800px;margin:40px auto;padding:0 20px;font-family:system-ui;line-height:1.7;color:#1a1a2e;background:#fafafa}}
h1,h2,h3{{color:#1a1a2e}}a{{color:#6366f1}}code{{background:#f0f0f0;padding:2px 6px;border-radius:4px}}
pre{{background:#f0f0f0;padding:1rem;overflow:auto;border-radius:8px}}</style></head>
<body><h1>{data['title']}</h1><p style='color:#888;font-size:.9em'>Shared via Research Assistant · {data['views']} views</p>
<hr>{body_html}</body></html>"""
    return HTMLResponse(html)

# ── Stats ──────────────────────────────────────────────────────────────────────
@app.get("/stats")
async def get_stats(user: dict = Depends(get_current_user)):
    stats = history_store.get_stats(user["google_id"])
    monitor_stats = {
        "topics": len(monitor.get_topics(user["google_id"])),
        "knowledge_items": len(monitor.get_knowledge_items(user["google_id"], limit=9999)),
    }
    return {**stats, "monitor": monitor_stats}

# ── Monitor ────────────────────────────────────────────────────────────────────
@app.get("/monitor/topics")
async def list_topics(user: dict = Depends(get_current_user)):
    return monitor.get_topics(user["google_id"])

@app.post("/monitor/topics")
async def add_topic(body: AddTopicRequest, user: dict = Depends(get_current_user)):
    if not body.topic.strip(): raise HTTPException(400, "Topic cannot be empty")
    monitor.add_topic(user["google_id"], body.topic.strip(), body.sync_interval_hours)
    return {"added": body.topic.strip(), "sync_interval_hours": body.sync_interval_hours}

@app.delete("/monitor/topics/{topic}")
async def remove_topic(topic: str, user: dict = Depends(get_current_user)):
    monitor.remove_topic(user["google_id"], topic)
    return {"removed": topic}

@app.post("/monitor/sync")
async def sync_all(user: dict = Depends(get_current_user)):
    if not _rate_check(f"sync:{user['google_id']}", 3, 60):
        raise HTTPException(429, "Sync rate limit — wait before syncing again.")
    results = await asyncio.get_event_loop().run_in_executor(None, monitor.sync_user, user["google_id"])
    return {"synced": results}

@app.post("/monitor/sync/{topic}")
async def sync_one(topic: str, user: dict = Depends(get_current_user)):
    if not _rate_check(f"sync:{user['google_id']}", 10, 60):
        raise HTTPException(429, "Sync rate limit — wait before syncing again.")
    new_count = await asyncio.get_event_loop().run_in_executor(None, monitor.sync_topic, user["google_id"], topic)
    return {"topic": topic, "new_items": new_count}

@app.get("/monitor/knowledge")
async def get_knowledge(topic: Optional[str] = None, limit: int = 50, user: dict = Depends(get_current_user)):
    items = monitor.get_knowledge_items(user["google_id"], topic=topic, limit=limit)
    return {"items": items, "total": len(items)}

@app.get("/monitor/briefings")
async def list_briefings(user: dict = Depends(get_current_user)):
    """All per-topic technology briefings (each topic is its own thread)."""
    return {"briefings": monitor.get_all_briefings(user["google_id"])}

@app.get("/monitor/briefing/{topic}")
async def get_briefing(topic: str, user: dict = Depends(get_current_user)):
    briefing = monitor.get_briefing(user["google_id"], topic)
    if not briefing:
        raise HTTPException(404, "No briefing yet — sync this topic first.")
    return briefing

@app.post("/monitor/briefing/{topic}")
async def refresh_briefing(topic: str, user: dict = Depends(get_current_user)):
    if not _rate_check(f"brief:{user['google_id']}", 10, 60):
        raise HTTPException(429, "Briefing rate limit — wait before regenerating.")
    briefing = await asyncio.get_event_loop().run_in_executor(
        None, monitor.generate_briefing, user["google_id"], topic
    )
    if not briefing:
        raise HTTPException(422, "No items to brief on yet — sync this topic first.")
    return briefing

@app.post("/monitor/briefing/{topic}/ask")
async def ask_briefing(topic: str, body: AskBriefingRequest, user: dict = Depends(get_current_user)):
    if not _rate_check(f"ask:{user['google_id']}", 15, 60):
        raise HTTPException(429, "Question rate limit — wait a moment.")
    result = await asyncio.get_event_loop().run_in_executor(
        None, monitor.ask_briefing, user["google_id"], topic, body.question.strip()
    )
    return result

@app.get("/monitor/new-counts")
async def new_counts(user: dict = Depends(get_current_user)):
    """New items per topic since the user's last visit — for per-topic badges."""
    return {"counts": monitor.get_new_counts_by_topic(user["google_id"])}

@app.get("/monitor/digest")
async def get_digest(user: dict = Depends(get_current_user)):
    return monitor.get_digest(user["google_id"])

@app.post("/monitor/visit")
async def mark_visit(user: dict = Depends(get_current_user)):
    monitor.mark_visited(user["google_id"])
    return {"ok": True}

@app.post("/monitor/job-post")
async def analyze_job_post(body: JobPostRequest, user: dict = Depends(get_current_user)):
    if not body.job_description.strip() and not body.job_position.strip():
        raise HTTPException(400, "job_description or job_position is required")
    ctx = {
        "job_description": body.job_description,
        "job_position":    body.job_position,
        "company_name":    body.company_name,
        "company_type":    body.company_type,
    }
    if body.auto_add:
        result = await asyncio.get_event_loop().run_in_executor(
            None, monitor.add_topics_from_job, user["google_id"], ctx
        )
    else:
        result = await asyncio.get_event_loop().run_in_executor(
            None, monitor.analyze_job_post, ctx
        )
    return result

@app.get("/health")
async def health(): return Response(status_code=200)

@app.on_event("startup")
async def startup():
    from src.config import JWT_SECRET, GOOGLE_CLIENT_ID, GROQ_API_KEY
    if JWT_SECRET == "change-me-in-production-use-a-long-random-string":
        logger.warning("⚠  JWT_SECRET is using the insecure default. Set a strong secret in env.")
    if not GOOGLE_CLIENT_ID:
        logger.warning("⚠  GOOGLE_CLIENT_ID not set — Google OAuth will fail.")
    logger.info("IntelLab API starting up (Groq: %s, Google OAuth: %s)",
                "ok" if GROQ_API_KEY else "MISSING",
                "ok" if GOOGLE_CLIENT_ID else "MISSING")
    monitor.start()

@app.on_event("shutdown")
async def shutdown(): monitor.stop()

# ── Serve built React SPA (production) ────────────────────────────────────────
# Must be registered AFTER all API routes so the catch-all doesn't shadow them.
_DIST = os.path.normpath(os.path.join(os.path.dirname(__file__), "..", "..", "frontend", "dist"))
_ASSETS = os.path.join(_DIST, "assets")

if os.path.isdir(_ASSETS):
    app.mount("/assets", StaticFiles(directory=_ASSETS), name="assets")
    logger.info(f"Serving frontend static assets from {_ASSETS}")

if os.path.isdir(_DIST):
    from fastapi.responses import FileResponse as _FileResponse

    @app.get("/{full_path:path}", include_in_schema=False)
    async def serve_spa(full_path: str):
        return _FileResponse(os.path.join(_DIST, "index.html"))
