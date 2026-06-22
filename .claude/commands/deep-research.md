---
description: Run a web-wide deep research pass on a topic (SearXNG + link-following crawl)
argument-hint: <topic or question>
---

Run a best-accuracy research pass on: **$ARGUMENTS**

1. Ensure SearXNG is reachable (`SEARXNG_URL` set, `USE_SEARXNG=true`); if not, note that web search will fall back to Tavily/stub.
2. Execute the research via the CLI with deep crawl enabled:
   ```bash
   cd backend && USE_DEEP_CRAWL=true python -m src.cli --query "$ARGUMENTS"
   ```
3. Summarize answer-first: open with a direct answer to exactly what was asked (the core question, in the first 1-3 sentences) BEFORE any background or context. Then widen out to related findings ordered by relevance, the credibility of the sources, and any "Conflicting Evidence" the graph flagged. Don't lead with history, prerequisites, or underlying technologies, and drop findings that turn out to be off-topic.
