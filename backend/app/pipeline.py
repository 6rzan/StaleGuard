"""run_check: [answer] -> extract -> flag -> search -> judge -> score -> [rewrite].

Progress is saved after every step so polling clients see claims fill in.
"""

import asyncio
import hashlib
import time
from datetime import UTC, datetime, timedelta

from . import spans, store
from .config import Settings
from .models import CachedVerification, Check, Claim, Judgement, to_iso
from .providers import LLM, Search
from .scoring import label_for, overall_score, score_claim, summarize

VOLATILITY_RANK = {"high": 0, "medium": 1, "low": 2}
CONCURRENCY = 4
MAX_ANSWER_CHARS = 8000
CACHE_TTL = {"high": timedelta(hours=6), "medium": timedelta(hours=24), "low": timedelta(days=7)}


def short_error(exc: Exception) -> str:
    return (str(exc) or type(exc).__name__)[:200]


def truncate(text: str, limit: int = MAX_ANSWER_CHARS) -> str:
    """Cut to `limit` chars, ending at the last sentence boundary when there is one."""
    if len(text) <= limit:
        return text
    window = text[: limit + 1]
    end = max(window.rfind(p + w) for p in ".!?" for w in " \n")
    return text[: end + 1] if end > 0 else text[:limit]


def cache_key(text: str) -> str:
    return hashlib.sha256(" ".join(text.lower().split()).encode()).hexdigest()


def cached_verification(
    settings: Settings, claim: Claim, now: datetime
) -> CachedVerification | None:
    row = store.cache_get(settings.database_path, cache_key(claim.text))
    if row is None:
        return None
    created_at, data = row
    cached = CachedVerification.model_validate_json(data)
    if now - datetime.fromisoformat(created_at) > CACHE_TTL[cached.volatility]:
        return None
    return cached


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
    try:
        await _run(check, settings, llm, search, started)
    except Exception as exc:
        # Never leave a check stuck in a running status: the client polls until done/error.
        check.status = "error"
        check.error = f"Check failed: {short_error(exc)}"
        save(settings, check, started)
    return check


def apply(claim: Claim, judgement: Judgement, now: datetime) -> None:
    score, breakdown = score_claim(judgement.verdict, judgement.confidence,
                                   claim.category, claim.volatility, claim.evidence, now)
    claim.verdict = judgement.verdict
    claim.confidence = judgement.confidence
    claim.current_value = judgement.current_value
    claim.explanation = judgement.explanation
    claim.freshness_score = score
    claim.score_breakdown = breakdown
    claim.label = label_for(judgement.verdict, score)


async def _run(check: Check, settings: Settings, llm: LLM, search: Search, started: float) -> None:
    if not check.answer:
        check.status = "generating"
        save(settings, check, started)
        try:
            text, call = await llm.answer(check.question)
        except Exception as exc:
            check.status = "error"
            check.error = f"Answer generation failed: {short_error(exc)}"
            save(settings, check, started)
            return
        check.model_calls.append(call)
        check.answer = truncate(text)

    check.status = "extracting"
    save(settings, check, started)

    try:
        raw_claims, call = await llm.extract_claims(check.answer)
    except Exception as exc:
        check.status = "error"
        check.error = f"Claim extraction failed: {short_error(exc)}"
        save(settings, check, started)
        return
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
                cached = settings.cache_enabled and cached_verification(settings, claim, now)
                if cached:
                    claim.evidence = cached.evidence
                    judgement = Judgement(verdict=cached.verdict, confidence=cached.confidence,
                                          current_value=cached.current_value,
                                          explanation=cached.explanation or "")
                    claim.cached = True
                    check.usage.cache_hits += 1
                else:
                    result = await search.search(claim)
                    check.usage.search_calls += result.calls
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
                apply(claim, judgement, now)
                # Only verifications backed by sources are worth reusing.
                if settings.cache_enabled and not claim.cached and claim.evidence:
                    entry = CachedVerification(
                        volatility=claim.volatility, verdict=judgement.verdict,
                        confidence=judgement.confidence, current_value=judgement.current_value,
                        explanation=judgement.explanation, evidence=claim.evidence,
                    )
                    store.cache_put(settings.database_path, cache_key(claim.text), to_iso(now),
                                    entry.model_dump_json())
                claim.status = "done"
            except Exception as exc:
                claim.status = "error"
                claim.error = short_error(exc)
                apply(claim, Judgement(verdict="unverified", confidence=0.0,
                                       explanation="Verification failed for this claim."), now)
            save(settings, check, started)

    await asyncio.gather(*(verify(c) for c in to_verify))

    outdated = [c for c in check.claims if c.verdict == "outdated" and c.current_value]
    if outdated:
        try:
            corrected, call = await llm.rewrite(check.answer, outdated)
            check.model_calls.append(call)
            check.corrected_answer = corrected
        except Exception:
            pass  # the report stands on its own; corrected_answer stays null
    check.status = "done"
    save(settings, check, started)
