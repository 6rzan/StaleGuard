import math
from datetime import UTC, datetime, timedelta

from app.models import Claim, Evidence
from app.scoring import label_for, overall_score, score_claim, summarize

NOW = datetime(2026, 11, 14, 12, 0, tzinfo=UTC)


def ev(stance: str, days_ago: float | None) -> Evidence:
    date = None
    if days_ago is not None:
        date = (NOW - timedelta(days=days_ago)).strftime("%Y-%m-%dT%H:%M:%SZ")
    return Evidence(title="t", url="https://example.com", snippet="s", published_date=date,
                    score=0.9, stance=stance)


def test_current_with_fresh_agreeing_sources():
    score, b = score_claim("current", 1.0, "pricing", "high", [ev("supports", 0)], NOW)
    assert (b.recency, b.agreement, b.quality) == (1.0, 1.0, 1.0)
    assert score == 100


def test_outdated_with_fresh_contradicting_sources():
    score, b = score_claim("outdated", 1.0, "pricing", "high", [ev("contradicts", 0)], NOW)
    assert b.quality == 1.0
    assert score == 0


def test_outdated_formula_matches_plan():
    evidence = [ev("contradicts", 90), ev("supports", None)]
    score, b = score_claim("outdated", 0.8, "pricing", "high", evidence, NOW)
    recency = (math.exp(-1) + 0.5) / 2
    quality = 0.8 * (0.5 * recency + 0.5 * 0.5)
    assert score == round(35 * (1 - quality))
    assert b.agreement == 0.5


def test_recency_decays_with_age_and_half_life():
    young, _ = score_claim("current", 1.0, "pricing", "high", [ev("supports", 10)], NOW)
    old, _ = score_claim("current", 1.0, "pricing", "high", [ev("supports", 400)], NOW)
    slow, _ = score_claim("current", 1.0, "regulation", "low", [ev("supports", 400)], NOW)
    assert young > slow > old


def test_neutral_sources_are_ignored():
    score, b = score_claim("current", 1.0, "pricing", "high", [ev("neutral", 0)], NOW)
    assert (b.recency, b.agreement) == (0.5, 0.5)
    assert score == 83  # 82.5 rounds half-up


def test_agreement_share():
    evidence = [ev("supports", 0), ev("supports", 0), ev("contradicts", 0), ev("neutral", 0)]
    _, b = score_claim("current", 1.0, "version", "high", evidence, NOW)
    assert b.agreement == 0.67


def test_unverified_depends_on_volatility_only():
    assert score_claim("unverified", 0.0, "pricing", "high", [], NOW)[0] == 35
    assert score_claim("unverified", 0.0, "pricing", "medium", [], NOW)[0] == 43
    assert score_claim("unverified", 0.9, "other", "low", [ev("supports", 0)], NOW)[0] == 50


def test_label_thresholds():
    assert label_for("current", 75) == "fresh"
    assert label_for("current", 74) == "review"
    assert label_for("current", 40) == "review"
    assert label_for("outdated", 39) == "stale"
    assert label_for("unverified", 90) == "unverified"


def claim(**kw) -> Claim:
    base = dict(id="c1", text="x", start=0, end=1, category="pricing", time_sensitive=True,
                volatility="high", risk_reason="", search_query="")
    return Claim(**(base | kw))


def test_overall_and_summary():
    claims = [
        claim(status="done", freshness_score=90, label="fresh"),
        claim(status="done", freshness_score=10, label="stale"),
        claim(status="error", freshness_score=35, label="unverified"),
        claim(status="skipped", time_sensitive=False),
        claim(status="pending"),
    ]
    assert overall_score(claims) == 45
    s = summarize(claims)
    assert (s.fresh, s.review, s.stale, s.unverified, s.skipped) == (1, 0, 1, 1, 1)
    assert overall_score([claim(status="skipped")]) is None


def test_naive_and_unparsable_dates():
    naive = Evidence(title="t", url="https://example.com", snippet="s",
                     published_date="2026-11-14T12:00:00", score=0.9, stance="supports")
    junk = naive.model_copy(update={"published_date": "last week"})
    _, b = score_claim("current", 1.0, "pricing", "high", [naive], NOW)
    assert b.recency == 1.0
    _, b = score_claim("current", 1.0, "pricing", "high", [junk], NOW)
    assert b.recency == 0.5
