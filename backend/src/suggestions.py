"""
Generate follow-up research questions after a completed research session.
Stored in message metadata and surfaced in the UI as clickable chips.
"""

import json
import logging
from src.llm import get_llm

logger = logging.getLogger(__name__)

_PROMPT = """You are a research guide. Based on this completed research session, suggest 5 follow-up questions
that would deepen understanding or explore productively related territory.

Original query: {query}
Report summary (first 800 chars): {report_preview}

Each question should cover a DIFFERENT angle:
1. Deeper dive into one specific finding
2. Practical / implementation angle
3. Comparison with an alternative approach
4. Future direction / open problem
5. Adjacent topic worth exploring

Return ONLY valid JSON:
{{"questions": ["question 1", "question 2", "question 3", "question 4", "question 5"]}}"""


def generate_follow_ups(query: str, report: str) -> list[str]:
    """Return 5 follow-up research questions. Falls back to empty list on any failure."""
    try:
        llm = get_llm(temperature=0.4)
        response = llm.invoke(_PROMPT.format(
            query=query,
            report_preview=report[:800],
        ))
        text = response.content.strip()
        if text.startswith("```"):
            text = text.split("```")[1]
            if text.startswith("json"):
                text = text[4:]
        result = json.loads(text.strip())
        return result.get("questions", [])[:5]
    except Exception as e:
        logger.warning(f"Follow-up generation failed: {e}")
        return []
