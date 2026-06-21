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

_DATA_DIR = os.getenv("DATA_DIR", ".")
CHECKPOINT_DB = os.getenv("CHECKPOINT_DB", os.path.join(_DATA_DIR, "checkpoints.db"))
HISTORY_DB    = os.getenv("HISTORY_DB",    os.path.join(_DATA_DIR, "history.db"))
MONITOR_DB    = os.getenv("MONITOR_DB",    os.path.join(_DATA_DIR, "monitor.db"))

MAX_ITERATIONS = int(os.getenv("MAX_ITERATIONS", "8"))
QUALITY_TARGET = int(os.getenv("QUALITY_TARGET", "75"))
TOP_K = int(os.getenv("TOP_K", "5"))

TAVILY_API_KEY = os.getenv("TAVILY_API_KEY")

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
