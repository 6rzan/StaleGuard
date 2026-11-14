"""run_check: extract -> flag -> search -> judge -> score, saving progress as it goes."""

import asyncio
import time
from datetime import UTC, datetime

from . import spans, store
from .config import Settings
from .models import Check, Claim, Judgement
from .providers import LLM, Search
from .scoring import label_for, overall_score, score_claim, summarize

VOLATILITY_RANK = {"high": 0, "medium": 1, "low": 2}
CONCURRENCY = 4


def short_error(exc: Exception) -> str:
    return (str(exc) or type(exc).__name__)[:200]


def save(settings: Settings, check: Check, started: float) -> None:
    check.summary = summarize(check.claims)
    check.overall_score = overall_score(check.claims)
    calls = check.model_calls
    check.usage.llm_calls = len(calls)
    check.usage.prompt_tokens = sum(c.prompt_tokens for c in calls)
    check.usage.completion_tokens = sum(c.completion_tokens for c in calls)
    check.usage.duration_ms = round((time.perf_counter() - started) * 1000)
    store.save(settings.database_path, check)


async def run_check(check_id: str, settings: Settings, llm: LLM, search: Search) -> Check:
    started = time.perf_counter()
    check = store.get(settings.database_path, check_id)
    check.status = "extracting"
    save(settings, check, started)

    try:
        raw_claims, call = await llm.extract_claims(check.answer)
    except Exception as exc:
        check.status = "error"
        check.error = f"Claim extraction failed: {short_error(exc)}"
        save(settings, check, started)
        return check
    check.model_calls.append(call)

    used: set[int] = set()
    located = []
    for raw in raw_claims:
        span = spans.locate(check.answer, raw.text, used)
        if span is None:
            continue  # not a real substring of the answer
        used.add(span[0])
        located.append((span, raw))
    located.sort(key=lambda item: item[0][0])
    check.claims = [
        Claim(**raw.model_dump(), id=f"c{i}", start=start, end=end)
        for i, ((start, end), raw) in enumerate(located, 1)
    ]
    for c in check.claims:
        c.text = check.answer[c.start : c.end]  # the normalised match may differ in whitespace

    flagged = sorted(
        (c for c in check.claims if c.time_sensitive), key=lambda c: VOLATILITY_RANK[c.volatility]
    )
    to_verify = flagged[: settings.max_claims]
    verify_ids = {c.id for c in to_verify}
    for c in check.claims:
        if c.id not in verify_ids:
            c.status = "skipped"
    check.status = "verifying"
    save(settings, check, started)

    now = datetime.now(UTC)
    semaphore = asyncio.Semaphore(CONCURRENCY)

    async def verify(claim: Claim) -> None:
        async with semaphore:
            claim.status = "verifying"
            save(settings, check, started)
            try:
                result = await search.search(claim)
                check.usage.search_calls += 1
                claim.evidence = result.evidence
                if result.evidence:
                    judgement, call = await llm.judge(
                        claim, result.evidence, result.answer, now.date().isoformat()
                    )
                    check.model_calls.append(call)
                    for item, stance in zip(claim.evidence, judgement.stances, strict=False):
                        item.stance = stance
                else:
                    judgement = Judgement(verdict="unverified", confidence=0.0,
                                          explanation="No sources found for this claim.")
                claim.status = "done"
            except Exception as exc:
                judgement = Judgement(verdict="unverified", confidence=0.0,
                                      explanation="Verification failed for this claim.")
                claim.status = "error"
                claim.error = short_error(exc)

            score, breakdown = score_claim(judgement.verdict, judgement.confidence,
                                           claim.category, claim.volatility, claim.evidence, now)
            claim.verdict = judgement.verdict
            claim.confidence = judgement.confidence
            claim.current_value = judgement.current_value
            claim.explanation = judgement.explanation
            claim.freshness_score = score
            claim.score_breakdown = breakdown
            claim.label = label_for(judgement.verdict, score)
            save(settings, check, started)

    await asyncio.gather(*(verify(c) for c in to_verify))
    check.status = "done"
    save(settings, check, started)
    return check
