# Feature Specification: StaleGuard — stale-answer detector for AI applications

**Feature**: `001-stale-answer-detector` | **Created**: 2026-11-14 | **Source**: Global AI Hackathon PS06 (Tavily + Bifrost)

LLMs state outdated prices, API versions, laws and leadership facts with full confidence. StaleGuard is a verification layer: it takes an LLM-generated answer, finds the factual claims that can go stale, re-verifies each one against the live web, and returns a freshness score per claim with the evidence behind it.

## User stories

### US1 — Check a pasted answer (P1, MVP)
A developer pastes an LLM answer and presses **Check freshness**. The answer is shown with every time-sensitive claim highlighted; each claim gets a verdict, a 0–100 freshness score, the current value when the claim is outdated, and links to dated sources.

Acceptance:
1. **Given** an answer with a price, a version number, a law and a CEO name, **when** it is checked, **then** each is listed as a claim with a category (PS06 req. 1) and flagged time-sensitive with a reason and volatility (req. 2).
2. **Given** flagged claims, **when** verification runs, **then** each is searched on the live web and returns ≥1 source with URL, title, snippet and publication date when known (req. 3).
3. **Given** evidence, **when** scoring runs, **then** each claim has an integer score 0–100, a label (`fresh` ≥75, `review` 40–74, `stale` <40, or `unverified`), and a visible breakdown (req. 4).
4. **Given** timeless claims ("Paris is the capital of France"), **then** they are marked `skipped`, not searched, not scored.
5. Results appear progressively: claims show up after extraction, then fill in one by one.

### US2 — Trust and inspect (P1, MVP)
The user can see why a score is what it is: verdict explanation, supporting vs contradicting sources, dates, and which model served each stage (including Bifrost failover), plus tokens, searches and duration.

### US3 — Use it without keys (P1, MVP)
With `MOCK_MODE=true` the whole flow works on bundled fixtures, with a visible "mock" badge. Tests and CI run this way.

### US4 — History (P2, MVP)
Past checks are stored and can be reopened.

### US5 — Verification layer for apps (P2, MVP)
Another application can call `POST /api/checks?wait=true` and get the finished report as JSON.

### US6 — Ask, then verify (P3, post-MVP)
The user types a question; the answer is generated through Bifrost and checked automatically.

### US7 — Corrected answer (P3, post-MVP)
For outdated claims the system offers a rewritten answer with the current values and a copy button.

## Functional requirements

- **FR-001** Extract factual claims as exact substrings of the answer, with character offsets.
- **FR-002** Classify each claim: `pricing | version | regulation | leadership | company_fact | statistic | other`; set `time_sensitive`, `volatility` (`high|medium|low`), a one-line `risk_reason` and a `search_query`.
- **FR-003** Verify at most `MAX_CLAIMS` (default 8) flagged claims, concurrently, highest volatility first.
- **FR-004** Verification = Tavily search → LLM judge over the evidence → verdict `current | outdated | unverified`, confidence, `current_value`, per-source stance.
- **FR-005** Score deterministically from verdict, confidence, source recency and source agreement (formula in plan.md). Same inputs → same score.
- **FR-006** All LLM calls go through Bifrost's OpenAI-compatible endpoint with per-stage models and a fallback list; record the model that actually served each call.
- **FR-007** A failed search or LLM call marks that claim `error`/`unverified`; the check still completes.
- **FR-008** Persist checks in SQLite; list and reopen them.
- **FR-009** Mock mode: no network, deterministic output, labelled in API and UI.
- **FR-010** Input limits: answer 1–8000 chars; reject otherwise with 422.

## Edge cases

- No time-sensitive claim found: the check finishes `done` with `overall_score=null`; the UI says so instead of showing an empty result.
- More flagged claims than `MAX_CLAIMS`: the rest are `skipped`; ties within a volatility level keep answer order.
- Search or model failure on one claim: that claim is `error`, the rest finish (FR-007).

## Success criteria

- **SC-001** The three bundled sample answers produce the expected verdicts in mock mode (tested).
- **SC-002** A full check in mock mode finishes in < 3 s; in live mode with 8 claims in < 45 s. Measured at review and recorded in validation.md.
- **SC-003** `pytest` and the frontend build pass with no keys set.
- **SC-004** The UI works at 375 px width with zero console errors.

## Out of scope

Auth, multi-user accounts, browser extension, streaming proxy, non-English answers.
