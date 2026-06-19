from langchain_groq import ChatGroq
from src.config import GROQ_API_KEY, MODEL


def get_llm(temperature: float = 0.2, streaming: bool = False) -> ChatGroq:
    return ChatGroq(
        model=MODEL,
        api_key=GROQ_API_KEY,
        temperature=temperature,
        max_tokens=4096,
    )
