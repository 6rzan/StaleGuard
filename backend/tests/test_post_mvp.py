"""Ask mode (T021), corrected answer (T022), claim cache (T023) and the smoke script (T025)."""

import sqlite3
from contextlib import closing
from datetime import UTC, datetime, timedelta

from app import smoke, store
from app.config import Settings
from app.mock import SAMPLES, MockLLM, MockSearch
from app.models import Check, to_iso
from app.pipeline import run_check, truncate

ANSWERS = {s["id"]: s["answer"] for s in SAMPLES}


async def check(settings, answer: str, question: str | None = None, llm=None, search=None,
                check_id: str = "t1") -> Check:
    store.save(settings.database_path, Check(
        id=check_id, created_at="2026-11-14T00:00:00Z", status="queued", mode="mock",
        answer=answer, question=question,
    ))
    return await run_check(check_id, settings, llm or MockLLM(), search or MockSearch())


class CountingSearch(MockSearch):
    def __init__(self):
        self.queries = []

    async def search(self, claim):
        self.queries.append(claim.text)
        return await super().search(claim)


# T021 ask mode


async def test_ask_mode_answers_best_matching_sample(settings):
    c = await check(settings, "", question="What is the latest Lumen API version?")
    assert c.status == "done"
    assert c.answer == ANSWERS["api-versions"]
    assert c.model_calls[0].stage == "answer"
    assert c.claims and all(c.answer[x.start:x.end] == x.text for x in c.claims)


async def test_ask_mode_unknown_question_falls_back_to_first_sample(settings):
    c = await check(settings, "", question="Why is the sky blue?")
    assert c.answer == ANSWERS["pricing"]


class FailingAnswerLLM(MockLLM):
    async def answer(self, question):
        raise RuntimeError("gateway down")


async def test_answer_generation_failure_ends_in_error(settings):
    c = await check(settings, "", question="Anything?", llm=FailingAnswerLLM())
    assert c.status == "error"
    assert c.error == "Answer generation failed: gateway down"


def test_truncate_cuts_at_sentence_boundary():
    text = "First sentence here. " * 500  # 10500 chars
    cut = truncate(text)
    assert len(cut) <= 8000 and cut.endswith("here.")
    assert truncate("x" * 9000) == "x" * 8000
    assert truncate("Short.") == "Short."


# T022 corrected answer


async def test_rewrite_replaces_only_outdated_claims(settings):
    c = await check(settings, ANSWERS["pricing"])
    assert c.corrected_answer == ANSWERS["pricing"].replace(
        "The Pro plan costs $20 per month per user",
        "The Pro plan costs $25 per month per user",
    )
    assert [m.stage for m in c.model_calls].count("rewrite") == 1


async def test_no_rewrite_when_nothing_is_outdated(settings):
    c = await check(settings, "The Team plan includes 50 GB of storage per seat for $35 per month.")
    assert c.claims[0].label == "fresh"
    assert c.corrected_answer is None
    assert all(m.stage != "rewrite" for m in c.model_calls)


async def test_rewrite_of_partial_sentence_changes_only_the_value(settings):
    c = await check(settings, "The Pro plan costs $20 per month per user.")
    assert c.claims[0].label == "stale"
    assert c.corrected_answer == "The Pro plan costs $25 per month per user."


async def test_rewrite_fixes_every_outdated_claim_in_place(settings):
    c = await check(settings, ANSWERS["leadership-regulation"])
    assert c.corrected_answer == ANSWERS["leadership-regulation"].replace(
        "Maria Okafor, who took over from the company's founder in 2021",
        "Daniel Reyes, who succeeded Maria Okafor in August 2026",
    )


class FailingRewriteLLM(MockLLM):
    async def rewrite(self, answer, outdated):
        raise RuntimeError("rewrite broke")


async def test_rewrite_failure_still_finishes(settings):
    c = await check(settings, ANSWERS["pricing"], llm=FailingRewriteLLM())
    assert c.status == "done"
    assert c.corrected_answer is None
    assert c.claims[1].label == "stale"


# T023 claim cache


async def test_second_run_is_served_from_cache(settings):
    first = await check(settings, ANSWERS["api-versions"], check_id="a")
    search = CountingSearch()
    second = await check(settings, ANSWERS["api-versions"], search=search, check_id="b")

    verified = [x for x in second.claims if x.status != "skipped"]
    assert search.queries == []
    assert second.usage.search_calls == 0
    assert second.usage.cache_hits == len(verified) == 3
    assert all(x.cached for x in verified)
    assert [x.freshness_score for x in second.claims] == [x.freshness_score for x in first.claims]
    assert not any(x.cached for x in first.claims)
    assert second.corrected_answer == first.corrected_answer


async def test_unverified_without_evidence_and_errors_are_not_cached(settings):
    class FailingOnce(MockSearch):
        async def search(self, claim):
            if "Pro plan" in claim.text:
                raise RuntimeError("search exploded")
            return await super().search(claim)

    await check(settings, ANSWERS["pricing"], search=FailingOnce(), check_id="a")
    search = CountingSearch()
    second = await check(settings, ANSWERS["pricing"], search=search, check_id="b")
    # Pro plan (error) and the 15% claim (no evidence) are searched again; Team plan is cached.
    assert len(search.queries) == 2
    assert second.usage.cache_hits == 1
    assert [x.cached for x in second.claims] == [False, False, True, False, False]


def age_cache(settings, hours: float) -> None:
    then = to_iso(datetime.now(UTC) - timedelta(hours=hours))
    with closing(sqlite3.connect(settings.database_path)) as conn, conn:
        conn.execute("UPDATE claim_cache SET created_at = ?", (then,))


async def test_cache_honours_ttl_by_volatility(settings):
    # All three api-versions claims are high volatility: 6 h TTL.
    await check(settings, ANSWERS["api-versions"], check_id="a")
    age_cache(settings, 5)
    fresh = await check(settings, ANSWERS["api-versions"], check_id="b")
    assert fresh.usage.cache_hits == 3
    age_cache(settings, 7)
    expired = await check(settings, ANSWERS["api-versions"], check_id="c")
    assert expired.usage.cache_hits == 0 and expired.usage.search_calls == 3


async def test_cache_can_be_disabled(settings):
    settings.cache_enabled = False
    await check(settings, ANSWERS["api-versions"], check_id="a")
    second = await check(settings, ANSWERS["api-versions"], check_id="b")
    assert second.usage.cache_hits == 0 and second.usage.search_calls == 3


# T025 smoke


def test_smoke_fails_cleanly_when_gateway_is_unreachable(monkeypatch, capsys):
    # Port 9 on loopback refuses connections; no Tavily key means no Tavily request either.
    unreachable = Settings(mock_mode=True, bifrost_base_url="http://127.0.0.1:9",
                           bifrost_api_key="sk-hidden", tavily_api_key="")
    monkeypatch.setattr(smoke, "load_settings", lambda: unreachable)
    assert smoke.main() == 1
    out = capsys.readouterr().out
    assert "FAIL bifrost  Cannot reach the Bifrost gateway at http://127.0.0.1:9" in out
    assert "FAIL tavily  TAVILY_API_KEY is not set" in out
    assert "sk-hidden" not in out
