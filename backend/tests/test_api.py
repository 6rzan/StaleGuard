import pytest
from fastapi.testclient import TestClient

from app.main import create_app


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
    assert all(s["question"] is None and s["answer"] for s in samples)


def test_check_with_wait_returns_finished_check(client):
    answer = client.get("/api/samples").json()[0]["answer"]
    r = client.post("/api/checks?wait=true", json={"answer": answer})
    assert r.status_code == 200
    check = r.json()
    assert check["status"] == "done"
    assert check["mode"] == "mock"
    assert check["answer"] == answer
    assert check["corrected_answer"] is None
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


def test_list_checks_newest_first_with_limit(client):
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
    [None, {}, {"answer": ""}, {"answer": "x" * 8001}, {"question": "Who leads Kestrel Labs?"},
     {"answer": "a", "question": "b"}],
)
def test_invalid_requests_are_422(client, body):
    r = client.post("/api/checks", json=body)
    assert r.status_code == 422


def test_question_only_message_is_clear(client):
    r = client.post("/api/checks", json={"question": "Who leads Kestrel Labs?"})
    assert "Ask mode" in str(r.json()["detail"])
