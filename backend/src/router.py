"""
Multi-model router — maps semantic roles to free LLM backends.

Roles
  fast   — routing, grading, JSON decisions             (Groq small / 8B)
  heavy  — drafting, synthesis                           (Groq 70B)
  reason — verification, contradiction, judging          (Groq reasoning, gpt-oss-120b)
  vision — image understanding / OCR                     (Gemini if key, else Groq Llama-4)
  long   — long-context synthesis over many findings     (Gemini if key, else Groq 70B)

Gemini is **lazy-imported** only when a Gemini-backed role is requested AND
GEMINI_API_KEY is set, so the app boots with Groq alone. Any Gemini failure falls
back to the Groq equivalent.

Audio transcription does not fit the chat-model abstraction; use
`transcribe_audio()` (Groq Whisper) directly.
"""
import logging

from src.config import (
    GROQ_API_KEY,
    GEMINI_API_KEY,
    MODEL_FAST,
    MODEL_HEAVY,
    MODEL_REASON,
    MODEL_VISION_GROQ,
    MODEL_VISION_GEMINI,
    MODEL_LONG_GEMINI,
    AUDIO_MODEL,
)

logger = logging.getLogger(__name__)

# Role → Groq model (also the fallback when Gemini is unavailable).
_GROQ_ROLE_MODELS = {
    "fast":   MODEL_FAST,
    "heavy":  MODEL_HEAVY,
    "reason": MODEL_REASON,
    "vision": MODEL_VISION_GROQ,
    "long":   MODEL_HEAVY,
}

_DEFAULT_MAX_TOKENS = {
    "fast": 1024, "heavy": 4096, "reason": 4096, "vision": 2048, "long": 8192,
}

# Roles that prefer Gemini when a key is present.
_GEMINI_ROLES = {"long", "vision"}
_GEMINI_ROLE_MODELS = {"long": MODEL_LONG_GEMINI, "vision": MODEL_VISION_GEMINI}


def _groq(model: str, temperature: float, streaming: bool, max_tokens: int):
    from langchain_groq import ChatGroq
    return ChatGroq(
        model=model, api_key=GROQ_API_KEY,
        temperature=temperature, max_tokens=max_tokens, streaming=streaming,
    )


def _gemini(model: str, temperature: float, max_tokens: int):
    from langchain_google_genai import ChatGoogleGenerativeAI
    return ChatGoogleGenerativeAI(
        model=model, google_api_key=GEMINI_API_KEY,
        temperature=temperature, max_output_tokens=max_tokens,
    )


def get_model(role: str = "heavy", *, temperature: float = 0.2,
              streaming: bool = False, max_tokens: int | None = None):
    """Return a chat model for the given semantic role (see module docstring)."""
    if role not in _GROQ_ROLE_MODELS:
        role = "heavy"
    mt = max_tokens or _DEFAULT_MAX_TOKENS.get(role, 4096)

    if role in _GEMINI_ROLES and GEMINI_API_KEY:
        try:
            return _gemini(_GEMINI_ROLE_MODELS[role], temperature, mt)
        except Exception as e:  # missing dep / bad key → fall back to Groq
            logger.warning("Gemini unavailable for role=%s (%s); using Groq fallback", role, e)

    return _groq(_GROQ_ROLE_MODELS[role], temperature, streaming, mt)


# ─── Cascade / escalation ────────────────────────────────────────────────────────

_ESCALATION_ORDER = ["fast", "heavy", "reason"]

_CONFIDENCE_PROMPT = (
    "On a scale of 0.0 to 1.0, how confident are you that the answer below fully and "
    "accurately addresses the request? Reply with ONLY the number.\n\n"
    "REQUEST:\n{prompt}\n\nANSWER:\n{answer}"
)


def _score_confidence(prompt: str, answer: str) -> float:
    try:
        judge = get_model("fast", temperature=0.0, max_tokens=8)
        raw = judge.invoke(_CONFIDENCE_PROMPT.format(prompt=prompt[:1500], answer=answer[:2500])).content
        import re
        m = re.search(r"[0-9]*\.?[0-9]+", raw)
        return max(0.0, min(1.0, float(m.group()))) if m else 1.0
    except Exception:
        return 1.0  # never block on a failed judge


def complete_with_escalation(prompt: str, start: str = "fast",
                             threshold: float = 0.6, temperature: float = 0.2) -> str:
    """
    Run `prompt` on a cheap tier; if a fast judge scores confidence below
    `threshold`, escalate to the next tier. Returns the best answer's text.
    Degrades gracefully to a single call on any error.
    """
    try:
        tiers = _ESCALATION_ORDER[_ESCALATION_ORDER.index(start):] or ["heavy"]
    except ValueError:
        tiers = ["heavy"]

    best = ""
    for tier in tiers:
        try:
            best = get_model(tier, temperature=temperature).invoke(prompt).content
        except Exception as e:
            logger.warning("Escalation tier=%s failed: %s", tier, e)
            continue
        if tier == tiers[-1] or _score_confidence(prompt, best) >= threshold:
            break
        logger.info("Escalating from tier=%s (low confidence)", tier)
    return best


# ─── Audio transcription (Groq Whisper) ──────────────────────────────────────────

def transcribe_audio(content: bytes, filename: str = "audio.mp3") -> str:
    """Transcribe audio bytes to text via Groq Whisper. Returns '' on failure."""
    try:
        from groq import Groq
        client = Groq(api_key=GROQ_API_KEY)
        result = client.audio.transcriptions.create(
            file=(filename, content), model=AUDIO_MODEL,
        )
        return getattr(result, "text", "") or ""
    except Exception as e:
        logger.error("Audio transcription failed: %s", e)
        return ""
