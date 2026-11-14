import json

import pytest

from app import store
from app.main import SAMPLES_PATH
from app.mock import MockLLM, MockSearch
from app.models import Check
from app.pipeline import run_check

SAMPLES = {s["id"]: s for s in json.loads(SAMPLES_PATH.read_text(encoding="utf-8"))}

# SC-001: (label or "skipped") per claim, in answer order.
EXPECTED = {
    "pricing": ["skipped", "stale", "fresh", "unverified", "skipped"],
    "api-versions": ["stale", "review", "fresh", "skipped", "skipped"],
    "leadership-regulation": ["stale", "fresh", "unverified", "skipped", "skipped"],
}


def new_check(settings, answer: str) -> Check:
    check = Check(id="t1", created_at="2026-11-14T00:00:00Z", status="queued", mode="mock",
                  answer=answer)
    store.save(settings.database_path, check)
    return check


def outcomes(check: Check) -> list[str]:
    return ["skipped" if c.status == "skipped" else c.label for c in check.claims]


@pytest.mark.parametrize("sample_id", EXPECTED)
async def test_samples_produce_expected_labels(settings, sample_id):
    answer = SAMPLES[sample_id]["answer"]
    new_check(settings, answer)
    check = await run_check("t1", settings, MockLLM(), MockSearch())

    assert check.status == "done"
    assert outcomes(check) == EXPECTED[sample_id]
    assert [c.id for c in check.claims] == [f"c{i}" for i in range(1, len(check.claims) + 1)]
    for c in check.claims:
        assert answer[c.start:c.end] == c.text
        if c.status == "skipped":
            assert c.freshness_score is None and c.evidence == []
        else:
            assert isinstance(c.freshness_score, int) and 0 <= c.freshness_score <= 100
            assert c.evidence or c.verdict == "unverified"
        if c.label == "stale":
            assert c.current_value
    scored = [c.freshness_score for c in check.claims if c.freshness_score is not None]
    assert check.overall_score == int(sum(scored) / len(scored) + 0.5)
    s = check.summary
    labels = outcomes(check)
    assert (s.fresh, s.review, s.stale, s.unverified, s.skipped) == tuple(
        labels.count(k) for k in ("fresh", "review", "stale", "unverified", "skipped")
    )
    assert check.usage.search_calls == len(scored)
    assert check.usage.llm_calls == len(check.model_calls) >= 1
    assert store.get(settings.database_path, "t1") == check


async def test_max_claims_keeps_highest_volatility(settings):
    settings.max_claims = 1
    new_check(settings, SAMPLES["leadership-regulation"]["answer"])
    check = await run_check("t1", settings, MockLLM(), MockSearch())
    verified = [c for c in check.claims if c.status != "skipped"]
    assert [c.category for c in verified] == ["leadership"]  # medium beats low


class FailingSearch(MockSearch):
    async def search(self, claim):
        if "Pro plan" in claim.text:
            raise RuntimeError("search exploded")
        return await super().search(claim)


async def test_failed_search_marks_only_that_claim(settings):
    new_check(settings, SAMPLES["pricing"]["answer"])
    check = await run_check("t1", settings, MockLLM(), FailingSearch())
    assert check.status == "done"
    failed = check.claims[1]
    assert failed.status == "error"
    assert failed.verdict == "unverified" and failed.label == "unverified"
    assert failed.error == "search exploded"
    assert failed.freshness_score == 35
    assert check.claims[2].label == "fresh"


class FailingLLM(MockLLM):
    async def extract_claims(self, answer):
        raise RuntimeError("gateway down")


async def test_failed_extraction_marks_check_error(settings):
    new_check(settings, SAMPLES["pricing"]["answer"])
    check = await run_check("t1", settings, FailingLLM(), MockSearch())
    assert check.status == "error"
    assert "gateway down" in check.error
    assert store.get(settings.database_path, "t1").status == "error"
