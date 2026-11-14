"""TavilySearch: live web evidence for one claim."""

from datetime import UTC, datetime
from email.utils import parsedate_to_datetime

import httpx

from .config import Settings
from .models import Claim, Evidence, SearchResult, to_iso

TAVILY_URL = "https://api.tavily.com/search"
NEWS_CATEGORIES = ("leadership", "company_fact")


def normalise_date(value: object) -> str | None:
    """Tavily dates come as RFC 2822 ("Tue, 11 Mar 2025 17:00:00 GMT") or ISO; return ISO UTC."""
    if not isinstance(value, str) or not value.strip():
        return None
    try:
        dt = datetime.fromisoformat(value.strip())
    except ValueError:
        try:
            dt = parsedate_to_datetime(value)
        except (TypeError, ValueError):
            return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=UTC)
    return to_iso(dt)


class TavilySearch:
    def __init__(self, settings: Settings, transport: httpx.AsyncBaseTransport | None = None):
        self.api_key = settings.tavily_api_key
        self.transport = transport

    async def search(self, claim: Claim) -> SearchResult:
        body = {
            "query": claim.search_query or claim.text,
            "topic": "news" if claim.category in NEWS_CATEGORIES else "general",
            "max_results": 5,
            "include_answer": True,
            "include_published_date": True,
            "search_depth": "basic",
        }
        async with httpx.AsyncClient(timeout=20, transport=self.transport) as client:
            response = await client.post(
                TAVILY_URL, json=body, headers={"Authorization": f"Bearer {self.api_key}"}
            )
        if response.status_code != 200:
            raise RuntimeError(f"Tavily search failed: HTTP {response.status_code}")
        data = response.json()
        evidence = []
        for r in data.get("results") or []:
            if not isinstance(r, dict) or not r.get("url"):
                continue
            evidence.append(
                Evidence(
                    title=str(r.get("title") or r["url"]),
                    url=str(r["url"]),
                    snippet=str(r.get("content") or "")[:500],
                    published_date=normalise_date(r.get("published_date")),
                    score=min(max(float(r.get("score") or 0), 0.0), 1.0),
                    stance="neutral",
                )
            )
        answer = data.get("answer")
        return SearchResult(evidence=evidence, answer=answer if isinstance(answer, str) else None)
