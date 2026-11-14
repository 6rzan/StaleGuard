import json

import httpx
import pytest

from app.config import Settings
from app.models import Claim
from app.search import TavilySearch, normalise_date


def claim(category: str) -> Claim:
    return Claim(id="c1", text="Kestrel Labs is led by CEO Maria Okafor.", start=0, end=40,
                 category=category, time_sensitive=True, volatility="medium", risk_reason="",
                 search_query="Kestrel Labs CEO")


def tavily(seen: list, status: int = 200, payload: dict | None = None) -> TavilySearch:
    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return httpx.Response(status, json=payload or {"results": []})

    settings = Settings(tavily_api_key="tvly-test")
    return TavilySearch(settings, transport=httpx.MockTransport(handler))


@pytest.mark.parametrize(("volatility", "time_range"),
                         [("high", "month"), ("medium", "year"), ("low", None)])
async def test_time_range_by_volatility(volatility, time_range):
    seen = []
    item = {"url": "https://a.example", "content": "x"}
    result = await tavily(seen, payload={"results": [item]}).search(
        claim("pricing").model_copy(update={"volatility": volatility}))
    assert json.loads(seen[0].content).get("time_range") == time_range
    assert len(seen) == 1 and result.calls == 1


async def test_empty_filtered_search_is_repeated_without_time_range():
    seen = []
    result = await tavily(seen).search(claim("pricing"))  # medium volatility, no results
    assert [json.loads(r.content).get("time_range") for r in seen] == ["year", None]
    assert result.calls == 2 and result.evidence == []


@pytest.mark.parametrize(
    ("category", "topic"),
    [("leadership", "news"), ("company_fact", "news"), ("pricing", "general"),
     ("other", "general")],
)
async def test_topic_by_category(category, topic):
    seen = []
    await tavily(seen).search(claim(category))
    body = json.loads(seen[0].content)
    assert body["topic"] == topic
    assert body["query"] == "Kestrel Labs CEO"
    assert body["max_results"] == 5 and body["include_answer"] is True
    assert body["search_depth"] == "basic" and body["include_published_date"] is True
    assert seen[0].headers["authorization"] == "Bearer tvly-test"


async def test_results_map_to_evidence():
    payload = {"answer": "Daniel Reyes is CEO.", "results": [
        {"title": "New CEO", "url": "https://example.com/a", "content": "Reyes takes over.",
         "score": 0.93, "published_date": "Tue, 11 Mar 2025 17:00:00 GMT"},
        {"title": "About", "url": "https://example.com/b", "content": "Leadership page.",
         "score": 1.7, "published_date": None},
        {"title": "No url"},
    ]}
    result = await tavily([], payload=payload).search(claim("leadership"))
    assert result.answer == "Daniel Reyes is CEO."
    assert [e.url for e in result.evidence] == ["https://example.com/a", "https://example.com/b"]
    first, second = result.evidence
    assert first.published_date == "2025-03-11T17:00:00Z"
    assert first.stance == "neutral" and first.snippet == "Reyes takes over."
    assert second.published_date is None and second.score == 1.0


def test_normalise_date():
    assert normalise_date("2025-03-11") == "2025-03-11T00:00:00Z"
    assert normalise_date("2025-03-11T17:00:00+02:00") == "2025-03-11T15:00:00Z"
    assert normalise_date("2025-03-11T17:00:00Z") == "2025-03-11T17:00:00Z"
    assert normalise_date("Tue, 11 Mar 2025 17:00:00 GMT") == "2025-03-11T17:00:00Z"
    assert normalise_date("last week") is None
    assert normalise_date("") is None and normalise_date(None) is None


@pytest.mark.parametrize("status", [401, 429])
async def test_http_errors_raise_clean_message(status):
    with pytest.raises(RuntimeError) as err:
        await tavily([], status=status).search(claim("pricing"))
    assert str(err.value) == f"Tavily search failed: HTTP {status}"
    assert "tvly-test" not in str(err.value)


async def test_http_error_includes_server_detail():
    payload = {"detail": {"error": "Unauthorized: missing or invalid API key."}}
    with pytest.raises(RuntimeError) as err:
        await tavily([], status=401, payload=payload).search(claim("pricing"))
    assert str(err.value) == (
        "Tavily search failed: HTTP 401: Unauthorized: missing or invalid API key."
    )


async def test_timeout_gives_clear_message():
    def handler(request):
        raise httpx.ReadTimeout("slow")

    search = TavilySearch(Settings(), transport=httpx.MockTransport(handler))
    with pytest.raises(RuntimeError, match="Tavily at https://api.tavily.com/search timed out"):
        await search.search(claim("pricing"))
