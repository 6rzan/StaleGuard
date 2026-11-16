import dataclasses
from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient

from app import main, store
from app.main import create_app
from app.mock import MockLLM, MockSearch


@pytest.fixture
def client(settings):
    with TestClient(create_app(settings)) as c:
        yield c


def test_health(client):
    body = client.get("/api/health").json()
    assert body["status"] == "ok"
    assert body["mode"] == "mock"
    assert set(body["models"]) == {"extract", "judge", "answer", "fallbacks"}


def test_samples(client):
    samples = client.get("/api/samples").json()
    assert [s["id"] for s in samples] == ["pricing", "api-versions", "leadership-regulation"]
    assert all(s["question"] and s["answer"] for s in samples)


def test_check_with_wait_returns_finished_check(client):
    answer = client.get("/api/samples").json()[0]["answer"]
    r = client.post("/api/checks?wait=true", json={"answer": answer})
    assert r.status_code == 200
    check = r.json()
    assert check["status"] == "done"
    assert check["mode"] == "mock"
    assert check["answer"] == answer
    assert "$25" in check["corrected_answer"] and check["corrected_answer"] != answer
    for c in check["claims"]:
        assert answer[c["start"]:c["end"]] == c["text"]
        assert c["cached"] is False


def test_check_without_wait_returns_202_and_can_be_polled(client):
    r = client.post("/api/checks", json={"answer": "The Pro plan costs $20 per month."})
    assert r.status_code == 202
    check_id = r.json()["id"]
    # TestClient runs background tasks before returning, so the check is finished here.
    check = client.get(f"/api/checks/{check_id}").json()
    assert check["status"] == "done"
    assert check["claims"][0]["label"] == "stale"


def test_list_checks_is_404_unless_shared_history_is_on(client, settings):
    check_id = client.post("/api/checks", json={"answer": "Answer."}).json()["id"]
    r = client.get("/api/checks")
    assert r.status_code == 404
    assert r.json() == {"detail": "Shared history is turned off"}
    assert client.get(f"/api/checks/{check_id}").status_code == 200
    settings.shared_history = True
    assert [c["id"] for c in client.get("/api/checks").json()] == [check_id]


def test_list_checks_newest_first_with_limit(client, settings):
    settings.shared_history = True
    ids = [client.post("/api/checks", json={"answer": f"Answer {i}."}).json()["id"]
           for i in range(3)]
    listed = client.get("/api/checks?limit=2").json()
    assert [c["id"] for c in listed] == ids[::-1][:2]
    assert listed[0]["excerpt"] == "Answer 2."
    assert client.get("/api/checks?limit=51").status_code == 422


def test_unknown_check_is_404(client):
    r = client.get("/api/checks/nope")
    assert r.status_code == 404
    assert r.json() == {"detail": "Check not found"}


@pytest.mark.parametrize(
    "body",
    [None, {}, {"answer": ""}, {"answer": "x" * 8001}, {"question": ""},
     {"answer": None, "question": None}],
)
def test_invalid_requests_are_422(client, body):
    r = client.post("/api/checks", json=body)
    assert r.status_code == 422


def test_ask_mode_generates_then_checks(client):
    r = client.post("/api/checks?wait=true", json={"question": "Who runs Kestrel Labs?"})
    assert r.status_code == 200
    check = r.json()
    assert check["status"] == "done"
    assert check["question"] == "Who runs Kestrel Labs?"
    assert check["answer"].startswith("Kestrel Labs is led by CEO Maria Okafor")
    assert check["model_calls"][0]["stage"] == "answer"
    assert "Daniel Reyes" in check["corrected_answer"]


def test_ask_mode_without_wait_starts_generating(client, settings):
    from app import store

    r = client.post("/api/checks", json={"question": "How much is Northwind Cloud?"})
    assert r.status_code == 202
    check = store.get(settings.database_path, r.json()["id"])
    assert check.status == "done" and check.answer


def test_answer_wins_when_both_given(client):
    r = client.post("/api/checks?wait=true",
                    json={"answer": "Paris is the capital of France.", "question": "Capital?"})
    check = r.json()
    assert check["answer"] == "Paris is the capital of France."
    assert check["question"] == "Capital?"
    assert all(c["stage"] != "answer" for c in check["model_calls"])


# Request limits (live mode only)


class CountingLLM(MockLLM):
    def __init__(self):
        self.calls = 0

    async def extract_claims(self, answer):
        self.calls += 1
        return await super().extract_claims(answer)


class Clock:
    def __init__(self):
        self.now = datetime(2026, 11, 15, 23, 59, 0, tzinfo=UTC)

    def __call__(self):
        return self.now


@pytest.fixture
def clock(monkeypatch):
    c = Clock()
    monkeypatch.setattr(main, "utcnow", c)
    return c


@pytest.fixture
def live(settings, monkeypatch):
    """Live-mode settings served by the mock providers, so nothing touches the network."""
    llm = CountingLLM()
    monkeypatch.setattr(main, "get_llm", lambda s: llm)
    monkeypatch.setattr(main, "get_search", lambda s: MockSearch())
    live_settings = dataclasses.replace(settings, mock_mode=False)
    with TestClient(create_app(live_settings)) as c:
        yield c, llm, live_settings


def post(client):
    return client.post("/api/checks", json={"answer": "Paris is the capital of France."})


def stored(settings) -> int:
    return len(store.list_recent(settings.database_path, 50))


def test_live_mode_allows_six_checks_a_minute_per_client(live, clock):
    client, llm, settings = live
    assert [post(client).status_code for _ in range(6)] == [202] * 6
    clock.now += timedelta(seconds=20)
    r = post(client)
    assert r.status_code == 429
    assert r.json() == {"detail": "Too many checks. Wait a minute and try again."}
    assert r.headers["Retry-After"] == "40"
    # Rejected before anything was stored or any provider was called.
    assert llm.calls == 6 and stored(settings) == 6
    clock.now += timedelta(seconds=41)
    assert post(client).status_code == 202


def test_mock_mode_has_no_request_limit(client, clock):
    assert all(post(client).status_code == 202 for _ in range(10))


def test_live_mode_daily_cap_resets_on_a_new_utc_day(live, clock):
    client, llm, settings = live
    settings.daily_live_checks = 2
    settings.rate_limit_per_minute = 100
    assert [post(client).status_code for _ in range(2)] == [202, 202]
    r = post(client)
    assert r.status_code == 429
    assert "daily limit" in r.json()["detail"]
    assert llm.calls == 2 and stored(settings) == 2
    clock.now += timedelta(minutes=2)  # 00:01 UTC the next day
    assert post(client).status_code == 202
