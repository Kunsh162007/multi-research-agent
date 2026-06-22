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
3. Summarize the resulting report's key findings, the credibility of its sources, and any "Conflicting Evidence" the graph flagged.
