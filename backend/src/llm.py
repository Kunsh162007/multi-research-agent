from langchain_groq import ChatGroq
from src.config import GROQ_API_KEY, MODEL, FAST_MODEL


def get_llm(temperature: float = 0.2, streaming: bool = False) -> ChatGroq:
    """Large model for generation, synthesis, validation."""
    return ChatGroq(model=MODEL, api_key=GROQ_API_KEY, temperature=temperature, max_tokens=4096)


def get_fast_llm(temperature: float = 0.1) -> ChatGroq:
    """Small fast model for routing, grading, rewriting decisions."""
    return ChatGroq(model=FAST_MODEL, api_key=GROQ_API_KEY, temperature=temperature, max_tokens=1024)
