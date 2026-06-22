"""
Stable LLM façade — thin wrappers over the multi-model router (src/router.py).

Existing callers (nodes, self_rag, advanced_rag, agents) keep using get_llm /
get_fast_llm unchanged; both now resolve through get_model() so model choice is
governed centrally by role.
"""
from src.router import get_model


def get_llm(temperature: float = 0.2, streaming: bool = False):
    """Large model for generation, synthesis, validation (role: heavy)."""
    return get_model("heavy", temperature=temperature, streaming=streaming, max_tokens=4096)


def get_fast_llm(temperature: float = 0.1):
    """Small fast model for routing, grading, rewriting decisions (role: fast)."""
    return get_model("fast", temperature=temperature, max_tokens=1024)
