import os
import sys
from dotenv import load_dotenv

load_dotenv()

GROQ_API_KEY = os.getenv("GROQ_API_KEY")
if not GROQ_API_KEY:
    sys.exit(
        "ERROR: GROQ_API_KEY is not set.\n"
        "Get a free key at https://console.groq.com → API Keys\n"
        "Then copy .env.example to .env and add it."
    )

MODEL      = os.getenv("MODEL",      "llama-3.3-70b-versatile")
FAST_MODEL = os.getenv("FAST_MODEL", "llama-3.1-8b-instant")

# ── Multi-model router tiers (all free) ──────────────────────────────────────────
# Semantic roles → concrete free models. Groq is the default backend for every
# chat role; Gemini (free tier) is used for vision + long-context when GEMINI_API_KEY
# is set. Override any of these via env without touching code.
GEMINI_API_KEY      = os.getenv("GEMINI_API_KEY")

MODEL_FAST          = os.getenv("MODEL_FAST",   FAST_MODEL)
MODEL_HEAVY         = os.getenv("MODEL_HEAVY",  MODEL)
MODEL_REASON        = os.getenv("MODEL_REASON", "openai/gpt-oss-120b")
MODEL_VISION_GROQ   = os.getenv("MODEL_VISION_GROQ", "meta-llama/llama-4-scout-17b-16e-instruct")
MODEL_VISION_GEMINI = os.getenv("MODEL_VISION_GEMINI", "gemini-2.0-flash")
MODEL_LONG_GEMINI   = os.getenv("MODEL_LONG_GEMINI", "gemini-2.0-flash")
AUDIO_MODEL         = os.getenv("AUDIO_MODEL", "whisper-large-v3")

_DATA_DIR = os.getenv("DATA_DIR", ".")
CHECKPOINT_DB = os.getenv("CHECKPOINT_DB", os.path.join(_DATA_DIR, "checkpoints.db"))
HISTORY_DB    = os.getenv("HISTORY_DB",    os.path.join(_DATA_DIR, "history.db"))
MONITOR_DB    = os.getenv("MONITOR_DB",    os.path.join(_DATA_DIR, "monitor.db"))

MAX_ITERATIONS = int(os.getenv("MAX_ITERATIONS", "8"))
QUALITY_TARGET = int(os.getenv("QUALITY_TARGET", "75"))
TOP_K = int(os.getenv("TOP_K", "5"))

TAVILY_API_KEY = os.getenv("TAVILY_API_KEY")

# ── Web-wide deep search ─────────────────────────────────────────────────────────
# Self-hosted SearXNG meta-search (no API key). When set, it becomes the default
# engine behind web_search (Tavily → stub remain ordered fallbacks).
SEARXNG_URL = os.getenv("SEARXNG_URL", "").rstrip("/")

# ── Feature flags (defaults off / auto) ──────────────────────────────────────────
def _flag(name: str, default: bool = False) -> bool:
    return os.getenv(name, str(default)).strip().lower() in ("1", "true", "yes", "on")

USE_SEARXNG    = _flag("USE_SEARXNG", bool(SEARXNG_URL))
USE_DEEP_CRAWL = _flag("USE_DEEP_CRAWL", False)
USE_CONSENSUS  = _flag("USE_CONSENSUS", False)

# Crawl bounds (deep_crawl BFS)
CRAWL_MAX_PAGES = int(os.getenv("CRAWL_MAX_PAGES", "12"))
CRAWL_MAX_DEPTH = int(os.getenv("CRAWL_MAX_DEPTH", "2"))

GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID")
JWT_SECRET = os.getenv("JWT_SECRET", "change-me-in-production-use-a-long-random-string")
JWT_ALGORITHM = "HS256"
JWT_EXPIRE_HOURS = 12

CORS_ORIGINS = [o.strip() for o in os.getenv("CORS_ORIGINS", "http://localhost:5173").split(",")]

MONITOR_INTERVAL_HOURS = int(os.getenv("MONITOR_INTERVAL_HOURS", "24"))

# Email notifications (optional — leave blank to disable)
SMTP_HOST = os.getenv("SMTP_HOST", "smtp.gmail.com")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER = os.getenv("SMTP_USER", "")
SMTP_PASS = os.getenv("SMTP_PASS", "")

# Public URL used in email links and share URLs
APP_URL = os.getenv("APP_URL", "https://research-assistant-0g24.onrender.com")
