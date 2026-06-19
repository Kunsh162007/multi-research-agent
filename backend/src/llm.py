from langchain_anthropic import ChatAnthropic
from src.config import ANTHROPIC_API_KEY, MODEL


def get_llm(temperature: float = 0.2, streaming: bool = False) -> ChatAnthropic:
    return ChatAnthropic(
        model=MODEL,
        api_key=ANTHROPIC_API_KEY,
        temperature=temperature,
        streaming=streaming,
        max_tokens=4096,
    )
