# Agentic Research Assistant

A production-ready AI research assistant that autonomously searches the web, arXiv, and GitHub, then synthesizes a cited report using **Self-RAG** (self-graded retrieval and answer quality). Includes a knowledge monitor that tracks AI/research topics per user and surfaces new papers and articles daily.

---

## Architecture

```
User Query
   │
   ▼  Phase 1: Prompt Enhancement
   │  enhance → clarified_query + research_angles
   │
   ▼  Phase 2: Agentic Loop + Self-RAG  ←─────────────┐
   │  decide_retrieval (Self-RAG: need more info?)      │
   │  retrieve         (agent picks tool + query)       │
   │  grade_relevance  (Self-RAG: keep relevant docs)   │
   │  generate         (draft answer from findings)     │
   │  grade_answer     (Self-RAG: quality score 0-100)  │
   │  route ──── quality < target AND iter < max ───────┘
   │       └─── quality ≥ target OR max iterations
   ▼  Phase 3: Synthesis
   │  synthesize → polished cited report
   ▼  Phase 4: Validation
      validate → final quality scores

Persistence:   checkpoints.db  (LangGraph — per-step, crash-resumable)
History:       history.db      (chat log — user-scoped, browsable)
Monitor:       monitor.db      (knowledge items — per user/topic)
Auth:          Google OAuth → JWT in sessionStorage
Frontend:      React + Vite + Tailwind
Backend:       FastAPI + LangGraph + Claude claude-sonnet-4-6
```

---

## Setup

### 1. Google OAuth (required for login)

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a project → **APIs & Services → Credentials → Create credentials → OAuth 2.0 Client ID**
3. Application type: **Web application**
4. Authorized JavaScript origins: `http://localhost:5173`
5. Authorized redirect URIs: `http://localhost:5173`
6. Copy your **Client ID** (looks like `xxx.apps.googleusercontent.com`)

### 2. Backend

```bash
cd backend
python -m venv venv
# Windows:
venv\Scripts\activate
# macOS/Linux:
source venv/bin/activate

pip install -r requirements.txt

cp .env.example .env
# Edit .env — set ANTHROPIC_API_KEY and GOOGLE_CLIENT_ID at minimum
```

### 3. Frontend

```bash
cd frontend
npm install

cp .env.example .env
# Edit .env — set VITE_GOOGLE_CLIENT_ID (same client ID as above)
```

---

## Running

### Backend API

```bash
cd backend
uvicorn src.api:app --reload --port 8000
```

### Frontend

```bash
cd frontend
npm run dev
# Opens at http://localhost:5173
```

### CLI (no login required — uses a fixed `cli-user` identity)

```bash
cd backend
python -m src.cli --query "What is retrieval-augmented generation?"
python -m src.cli --query "State of LLM fine-tuning 2025" --audience technical
python -m src.cli --resume <thread_id>
python -m src.cli --list-history
python -m src.cli --show-history <thread_id>
python -m src.cli --search-history "safety"
```

### Tests

```bash
cd backend
pytest tests/ -v
```

---

## Features

### Streaming
Every research run streams progress events and final report tokens to the UI in real time via Server-Sent Events. The event schema:

```json
{"type": "step",  "node": "retrieve",   "detail": "Searching arXiv…"}
{"type": "state", "iteration": 2,        "quality": 68}
{"type": "token", "text": "RAG stands…"}
{"type": "final", "report": "…",        "validation": {…}, "thread_id": "…"}
{"type": "error", "message": "…"}
```

### Persistence (crash recovery)
Every graph step is checkpointed to `checkpoints.db`. If the process crashes mid-run, re-invoking with the same `thread_id` resumes from the last saved step:

```bash
python -m src.cli --resume <thread_id>
# or POST /resume/<thread_id>
```

### Chat History
Every conversation is saved to `history.db` — browsable from the sidebar and searchable:

```
GET  /history                   — list conversations
GET  /history/<thread_id>       — full message log
GET  /history/search?q=safety   — full-text search
DELETE /history/<thread_id>     — delete a conversation
```

### Multimodal Input
Attach **any data form** — the `/upload` endpoint normalizes everything into research
context: PDF/DOCX/TXT/MD (text), **images** (PNG/JPG/WEBP → vision caption + OCR),
**audio** (MP3/WAV/M4A → Whisper transcript), and **data files** (CSV/JSON/XLSX → pandas
summary). Image vision needs `GEMINI_API_KEY` (or Groq Llama-4); audio needs Groq Whisper.

### Slash Commands
Type `/` in the chat box for a Claude-Code-style command palette: `/research`, `/deep`,
`/explain`, `/validate`, `/discover`, `/diagram`, `/consensus`, `/paper`, `/export`,
`/upload`, `/help`. The repo also ships Claude Code project commands under
`.claude/commands/` (`/deep-research`, `/make-paper`, `/add-topic`).

### Web-wide Deep Search (SearXNG)
For research that "looks at every site", run the bundled self-hosted **SearXNG** meta-search
(aggregates Google, Bing, DuckDuckGo, Brave, arXiv, GitHub, … — no API key):

```bash
docker compose -f docker-compose.searxng.yml up -d
# then in backend/.env:
#   SEARXNG_URL=http://localhost:8080
#   USE_SEARXNG=true
```

When `SEARXNG_URL` is set it becomes the default engine behind `web_search` (Tavily → stub
remain fallbacks). Enable **deep crawl** (`USE_DEEP_CRAWL=true`, or the `/deep` command / "Deep
Search" toggle) to follow links from search hits via a BFS crawler with clean text extraction
(`trafilatura`). `POST /deep-search {query}` exposes it directly.

### Knowledge Monitor
Track AI or research topics. The monitor fetches new arXiv papers and web articles:
- **Scheduled**: runs every `MONITOR_INTERVAL_HOURS` (default 24h) automatically
- **On-demand**: click "Sync" in the UI or call `POST /monitor/sync`

Only new content (by URL+title hash) is stored — duplicates are silently skipped.

### Session Behaviour
- Login with Google → JWT stored in `sessionStorage`
- **Refresh page** → still logged in (sessionStorage survives refresh)
- **Close the tab/window** → sessionStorage cleared → must log in again

---

## Configuration

All config lives in `backend/.env`:

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `ANTHROPIC_API_KEY` | ✓ | — | Claude API key |
| `GOOGLE_CLIENT_ID` | ✓ | — | OAuth client ID |
| `JWT_SECRET` | ✓ | weak default | Change in production |
| `TAVILY_API_KEY` | — | stub search | Real web search |
| `MAX_ITERATIONS` | — | 8 | Self-RAG loop cap |
| `QUALITY_TARGET` | — | 75 | Self-RAG quality gate (0-100) |
| `MONITOR_INTERVAL_HOURS` | — | 24 | Knowledge monitor frequency |

---

## Resetting

```bash
# Clear all checkpoints (in-progress runs will restart)
rm backend/checkpoints.db

# Clear chat history
rm backend/history.db

# Clear knowledge monitor data
rm backend/monitor.db
```

---

## API Reference

| Method | Path | Description |
|---|---|---|
| POST | `/auth/google` | Verify Google token, return JWT |
| GET  | `/auth/me` | Current user |
| POST | `/research` | Start research (SSE stream) |
| POST | `/resume/{thread_id}` | Resume interrupted run (SSE) |
| GET  | `/history` | List conversations |
| GET  | `/history/{thread_id}` | Conversation messages |
| GET  | `/history/search?q=` | Search history |
| DELETE | `/history/{thread_id}` | Delete conversation |
| GET  | `/monitor/topics` | List tracked topics |
| POST | `/monitor/topics` | Add topic |
| DELETE | `/monitor/topics/{topic}` | Remove topic |
| POST | `/monitor/sync` | Sync all topics |
| POST | `/monitor/sync/{topic}` | Sync one topic |
| GET  | `/monitor/knowledge` | Get knowledge items |
