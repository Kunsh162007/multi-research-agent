import asyncio, logging
from typing import Optional
import jwt as pyjwt
from fastapi import Depends, FastAPI, File, HTTPException, Request, UploadFile, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, Response, HTMLResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
import os

from src.auth import create_jwt, decode_jwt, verify_google_token
from src.config import CORS_ORIGINS
from src.history import history_store
from src.monitor import monitor
from src.runner import resume_research, run_research

logger = logging.getLogger(__name__)
app = FastAPI(title="Agentic Research Assistant", version="2.0.0")

_UPLOAD_MAX_BYTES = 10 * 1024 * 1024  # 10 MB


def _compact_context(text: str, max_chars: int = 3000) -> str:
    """Truncate a long text block to keep it within LLM context limits."""
    if len(text) <= max_chars:
        return text
    half = max_chars // 2
    omitted = len(text) - max_chars
    return text[:half] + f"\n…[{omitted} chars omitted]…\n" + text[-half:]
app.add_middleware(CORSMiddleware, allow_origins=CORS_ORIGINS, allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

_bearer = HTTPBearer()

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(_bearer)) -> dict:
    try: return decode_jwt(credentials.credentials)
    except pyjwt.ExpiredSignatureError: raise HTTPException(401, "Token expired")
    except pyjwt.InvalidTokenError:    raise HTTPException(401, "Invalid token")

class GoogleAuthRequest(BaseModel):
    credential: str

class ResearchRequest(BaseModel):
    query: str
    audience: Optional[str] = "general"
    thread_id: Optional[str] = None
    constraints: Optional[dict] = None
    doc_context: Optional[list] = []     # pre-loaded docs from file uploads / URL fetches

class AddTopicRequest(BaseModel):
    topic: str

class JobPostRequest(BaseModel):
    job_description: str
    auto_add: bool = False

class TagRequest(BaseModel):
    tag: str

# ── Auth ───────────────────────────────────────────────────────────────────────
@app.post("/auth/google")
async def auth_google(body: GoogleAuthRequest):
    try: user_info = verify_google_token(body.credential)
    except ValueError as e: raise HTTPException(401, str(e))
    history_store.upsert_user(**user_info)
    return {"access_token": create_jwt(user_info), "token_type": "bearer", "user": user_info}

@app.get("/auth/me")
async def auth_me(user: dict = Depends(get_current_user)): return user

# ── Research ───────────────────────────────────────────────────────────────────
@app.post("/research")
async def research(body: ResearchRequest, user: dict = Depends(get_current_user)):
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
async def export_report(thread_id: str, format: str = "md", user: dict = Depends(get_current_user)):
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

    from src.export_report import to_markdown, to_pdf, to_bibtex
    if format == "pdf":
        data = to_pdf(title, query, report)
        if not data: raise HTTPException(500, "fpdf2 not installed. Run: pip install fpdf2")
        return Response(content=data, media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="{thread_id[:8]}.pdf"'})
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
    monitor.add_topic(user["google_id"], body.topic.strip())
    return {"added": body.topic.strip()}

@app.delete("/monitor/topics/{topic}")
async def remove_topic(topic: str, user: dict = Depends(get_current_user)):
    monitor.remove_topic(user["google_id"], topic)
    return {"removed": topic}

@app.post("/monitor/sync")
async def sync_all(user: dict = Depends(get_current_user)):
    results = await asyncio.get_event_loop().run_in_executor(None, monitor.sync_user, user["google_id"])
    return {"synced": results}

@app.post("/monitor/sync/{topic}")
async def sync_one(topic: str, user: dict = Depends(get_current_user)):
    new_count = await asyncio.get_event_loop().run_in_executor(None, monitor.sync_topic, user["google_id"], topic)
    return {"topic": topic, "new_items": new_count}

@app.get("/monitor/knowledge")
async def get_knowledge(topic: Optional[str] = None, limit: int = 50, user: dict = Depends(get_current_user)):
    items = monitor.get_knowledge_items(user["google_id"], topic=topic, limit=limit)
    return {"items": items, "total": len(items)}

@app.get("/monitor/digest")
async def get_digest(user: dict = Depends(get_current_user)):
    return monitor.get_digest(user["google_id"])

@app.post("/monitor/visit")
async def mark_visit(user: dict = Depends(get_current_user)):
    monitor.mark_visited(user["google_id"])
    return {"ok": True}

@app.post("/monitor/job-post")
async def analyze_job_post(body: JobPostRequest, user: dict = Depends(get_current_user)):
    if not body.job_description.strip():
        raise HTTPException(400, "job_description is required")
    if body.auto_add:
        result = await asyncio.get_event_loop().run_in_executor(
            None, monitor.add_topics_from_job, user["google_id"], body.job_description
        )
    else:
        result = await asyncio.get_event_loop().run_in_executor(
            None, monitor.analyze_job_post, body.job_description
        )
    return result

@app.on_event("startup")
async def startup(): monitor.start()

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
