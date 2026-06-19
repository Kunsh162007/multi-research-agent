import logging
import requests
import arxiv as arxiv_lib
from typing import List, Dict, Any
from src.config import TAVILY_API_KEY, TOP_K

logger = logging.getLogger(__name__)


# ─── Web Search ────────────────────────────────────────────────────────────────

def web_search(query: str, num_results: int = TOP_K) -> List[Dict[str, Any]]:
    if TAVILY_API_KEY:
        return _tavily_search(query, num_results)
    return _stub_search(query, num_results)


def _tavily_search(query: str, num_results: int) -> List[Dict[str, Any]]:
    try:
        from tavily import TavilyClient
        client = TavilyClient(api_key=TAVILY_API_KEY)
        response = client.search(query, max_results=num_results)
        return [
            {
                "text": r.get("content", ""),
                "source": r.get("title", "Web Result"),
                "url": r.get("url", ""),
                "relevance": r.get("score", 1.0),
            }
            for r in response.get("results", [])
        ]
    except Exception as e:
        logger.error(f"Tavily search failed: {e}")
        return _stub_search(query, num_results)


def _stub_search(query: str, num_results: int) -> List[Dict[str, Any]]:
    # Returns clearly-marked placeholders so the system runs without a real key.
    return [
        {
            "text": (
                f"[STUB RESULT {i + 1}] No real search API key configured. "
                f"This is a placeholder for query: '{query}'. "
                "Add TAVILY_API_KEY to .env for real results."
            ),
            "source": f"Stub Source {i + 1}",
            "url": f"https://example.com/stub/{i + 1}",
            "relevance": max(0.1, 0.5 - i * 0.1),
        }
        for i in range(min(num_results, 3))
    ]


# ─── ArXiv Search ──────────────────────────────────────────────────────────────

def arxiv_search(query: str, max_results: int = TOP_K) -> List[Dict[str, Any]]:
    try:
        client = arxiv_lib.Client()
        search = arxiv_lib.Search(
            query=query,
            max_results=max_results,
            sort_by=arxiv_lib.SortCriterion.Relevance,
        )
        results = []
        for paper in client.results(search):
            results.append({
                "text": (
                    f"Title: {paper.title}\n"
                    f"Authors: {', '.join(str(a) for a in paper.authors)}\n"
                    f"Published: {paper.published.strftime('%Y-%m-%d') if paper.published else 'Unknown'}\n\n"
                    f"Abstract: {paper.summary}"
                ),
                "source": paper.title,
                "url": paper.entry_id,
                "relevance": 1.0,
                "published": paper.published.isoformat() if paper.published else None,
            })
        return results
    except Exception as e:
        logger.error(f"ArXiv search failed: {e}")
        return []


# ─── GitHub Search ─────────────────────────────────────────────────────────────

def github_search(query: str, num_results: int = TOP_K) -> List[Dict[str, Any]]:
    try:
        resp = requests.get(
            "https://api.github.com/search/repositories",
            params={"q": query, "sort": "stars", "order": "desc", "per_page": num_results},
            timeout=10,
            headers={"Accept": "application/vnd.github.v3+json"},
        )
        resp.raise_for_status()
        results = []
        for repo in resp.json().get("items", []):
            results.append({
                "text": (
                    f"Repository: {repo['full_name']}\n"
                    f"Description: {repo.get('description') or 'No description'}\n"
                    f"Stars: {repo['stargazers_count']:,}\n"
                    f"Language: {repo.get('language') or 'Unknown'}\n"
                    f"Topics: {', '.join(repo.get('topics', []))}"
                ),
                "source": repo["full_name"],
                "url": repo["html_url"],
                "relevance": 1.0,
            })
        return results
    except Exception as e:
        logger.error(f"GitHub search failed: {e}")
        return []


# ─── Wikipedia Search ──────────────────────────────────────────────────────────

def wikipedia_search(query: str, num_results: int = TOP_K) -> List[Dict[str, Any]]:
    try:
        import re
        resp = requests.get(
            "https://en.wikipedia.org/w/api.php",
            params={
                "action": "query",
                "list": "search",
                "srsearch": query,
                "srlimit": num_results,
                "format": "json",
                "srnamespace": 0,
            },
            timeout=10,
        )
        resp.raise_for_status()
        results = []
        for item in resp.json().get("query", {}).get("search", []):
            title = item.get("title", "")
            snippet = re.sub(r"<[^>]+>", "", item.get("snippet", ""))
            results.append({
                "text": f"Title: {title}\n\n{snippet}",
                "source": f"Wikipedia: {title}",
                "url": f"https://en.wikipedia.org/wiki/{title.replace(' ', '_')}",
                "relevance": 1.0,
            })
        return results
    except Exception as e:
        logger.error(f"Wikipedia search failed: {e}")
        return []


# ─── Semantic Scholar Search ───────────────────────────────────────────────────

def semantic_scholar_search(query: str, num_results: int = TOP_K) -> List[Dict[str, Any]]:
    try:
        resp = requests.get(
            "https://api.semanticscholar.org/graph/v1/paper/search",
            params={
                "query": query,
                "limit": num_results,
                "fields": "title,authors,year,abstract,externalIds",
            },
            timeout=10,
        )
        resp.raise_for_status()
        results = []
        for paper in resp.json().get("data", []):
            authors = ", ".join(a.get("name", "") for a in paper.get("authors", [])[:3])
            doi = paper.get("externalIds", {}).get("DOI", "")
            url = (
                f"https://doi.org/{doi}" if doi
                else f"https://www.semanticscholar.org/paper/{paper.get('paperId', '')}"
            )
            results.append({
                "text": (
                    f"Title: {paper.get('title', '')}\n"
                    f"Authors: {authors}\n"
                    f"Year: {paper.get('year', 'Unknown')}\n\n"
                    f"Abstract: {paper.get('abstract') or 'No abstract available'}"
                ),
                "source": paper.get("title", "Semantic Scholar Paper"),
                "url": url,
                "relevance": 1.0,
            })
        return results
    except Exception as e:
        logger.error(f"Semantic Scholar search failed: {e}")
        return []


# ─── CrossRef Search ───────────────────────────────────────────────────────────

def crossref_search(query: str, num_results: int = TOP_K) -> List[Dict[str, Any]]:
    try:
        import re
        resp = requests.get(
            "https://api.crossref.org/works",
            params={
                "query": query,
                "rows": num_results,
                "select": "title,author,published,abstract,DOI",
            },
            headers={"User-Agent": "ResearchAssistant/2.0 (mailto:research@example.com)"},
            timeout=10,
        )
        resp.raise_for_status()
        results = []
        for item in resp.json().get("message", {}).get("items", []):
            title = " ".join(item.get("title", ["Unknown Title"]))
            authors = ", ".join(
                f"{a.get('given', '')} {a.get('family', '')}".strip()
                for a in item.get("author", [])[:3]
            )
            doi = item.get("DOI", "")
            year = (item.get("published", {}).get("date-parts") or [[None]])[0][0]
            abstract = re.sub(r"<[^>]+>", "", item.get("abstract", "No abstract available"))
            results.append({
                "text": (
                    f"Title: {title}\n"
                    f"Authors: {authors}\n"
                    f"Year: {year or 'Unknown'}\n\n"
                    f"Abstract: {abstract}"
                ),
                "source": title,
                "url": f"https://doi.org/{doi}" if doi else "",
                "relevance": 1.0,
            })
        return results
    except Exception as e:
        logger.error(f"CrossRef search failed: {e}")
        return []


# ─── Summarize ─────────────────────────────────────────────────────────────────

def summarize(text: str, max_length: int = 500) -> str:
    if len(text) <= max_length:
        return text
    return text[:max_length].rsplit(" ", 1)[0] + "…"


# ─── Registry ──────────────────────────────────────────────────────────────────

TOOL_REGISTRY: Dict[str, Any] = {
    "web_search": web_search,
    "arxiv_search": arxiv_search,
    "github_search": github_search,
    "wikipedia_search": wikipedia_search,
    "semantic_scholar_search": semantic_scholar_search,
    "crossref_search": crossref_search,
    "summarize": summarize,
}
