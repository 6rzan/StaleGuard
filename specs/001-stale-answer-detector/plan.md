# Implementation Plan: StaleGuard

**Spec**: [spec.md](spec.md) | **Contract**: [contracts/api.md](contracts/api.md)

## Stack

- **backend/** Python 3.11+, FastAPI, httpx, pydantic v2, stdlib `sqlite3`. Managed with `uv` (`pyproject.toml`). Tests: pytest. Lint: ruff.
- **frontend/** Vite + React + TypeScript, plain CSS (no UI library). `npm run build` = typecheck + bundle.
- **Gateway** Bifrost (`npx -y @maximhq/bifrost` or `maximhq/bifrost` Docker image, port 8080).
- **Search** Tavily REST API (`POST https://api.tavily.com/search`, `Authorization: Bearer tvly-…`) via httpx. No SDK needed.

## Layout

```
backend/
  pyproject.toml
  app/
    main.py        FastAPI app, routes, CORS, serves frontend/dist when present
    config.py      env → Settings (one place)
    models.py      pydantic schemas = contracts/api.md
    store.py       SQLite: checks(id, created_at, data JSON); claim_cache (post-MVP)
    scoring.py     freshness formula (pure functions)
    prompts.py     extract / judge / answer / rewrite prompts
    spans.py       locate claim text in the answer
    llm.py         BifrostLLM (OpenAI-compatible client)
    search.py      TavilySearch
    mock.py        MockLLM, MockSearch (fixtures)
    providers.py   get_llm(), get_search() by MOCK_MODE
    pipeline.py    run_check(check_id): extract → flag → search → judge → score
    smoke.py       post-MVP: real-key smoke test
    fixtures/      samples.json, search.json
  tests/
frontend/
  src/ api.ts, types.ts, App.tsx, components/, styles.css
specs/, docs/, .github/
```

## Pipeline

1. **Extract** (LLM, `MODEL_EXTRACT`, JSON mode): answer → claims `{text, category, time_sensitive, volatility, risk_reason, search_query}`. `spans.locate` maps each `text` to offsets (exact match, then whitespace-normalised match; drop the claim if not found).
2. **Flag**: `time_sensitive=false` → `status=skipped`. Flagged claims sorted by volatility; beyond `MAX_CLAIMS` → `skipped`.
3. **Search** (Tavily): one search per flagged claim. `topic="news"` for `leadership` and `company_fact`, else `"general"`; `max_results=5`; `include_answer=true`; request published dates.
4. **Judge** (LLM, `MODEL_JUDGE`, JSON mode): claim + today's date + numbered evidence → `{verdict, confidence, current_value, explanation, stances[]}`. No evidence → `unverified` without an LLM call.
5. **Score**: `scoring.score_claim(...)`. Persist after every claim so polling shows progress.
6. **Finish**: `overall_score`, `summary`, `usage`, `status=done`.

Claims run concurrently behind `asyncio.Semaphore(4)`. One claim failing never fails the check (FR-007).

## Freshness score (deterministic)

```
half_life_days = {pricing: 90, version: 120, leadership: 180, regulation: 365,
                  company_fact: 365, statistic: 365, other: 365}
recency   = mean over stance-bearing sources of exp(-age_days / half_life)   (0.5 for a source with no date; 0.5 if none)
agreement = share of stance-bearing sources that agree with the verdict     (supports for current, contradicts for outdated; 0.5 if none)
quality   = confidence * (0.5 * recency + 0.5 * agreement)                  # 0..1

current    → score = round(65 + 35 * quality)          # 65..100
outdated   → score = round(35 * (1 - quality))         # 0..35
unverified → score = round(50 - 15 * vol)              # vol: high 1, medium 0.5, low 0

label: unverified verdict → "unverified"; else ≥75 "fresh", 40–74 "review", <40 "stale"
overall_score = round(mean(score of scored claims)), null when none
```

`score_breakdown = {verdict, confidence, recency, agreement, quality}` is returned with each claim.

## How Bifrost is used (FR-006)

- Single OpenAI-compatible endpoint `{BIFROST_BASE_URL}/v1/chat/completions`; models named `provider/model`.
- **Per-stage routing**: a cheap model extracts claims (`MODEL_EXTRACT`), a stronger one judges evidence (`MODEL_JUDGE`), `MODEL_ANSWER` generates answers in ask mode.
- **Failover**: every request carries `fallbacks: [...]` from `MODEL_FALLBACKS`; the response's `extra_fields` (routing info) tells which provider/model served it. The UI shows "served by X (fallback)".
- **Governance**: optional virtual key header (`BIFROST_VIRTUAL_KEY`) so the gateway enforces budgets and rate limits per app.
- **Observability**: token usage per stage comes from gateway responses; the Bifrost dashboard on :8080 shows every request.

## How Tavily is used

- Live evidence for every flagged claim: ranked results with snippets, relevance score and publication date, plus Tavily's synthesised answer as a hint for the judge.
- Topic routing (`news` vs `general`) by claim category; recency of the returned sources feeds the score.

## Mock mode

`MOCK_MODE=true` (default). `MockLLM` extracts claims with rules (sentence split + regex per category) and judges from fixture stances; `MockSearch` returns `fixtures/search.json` entries matched by keyword, none otherwise (→ `unverified`). Fixtures use fictional companies and `https://example.com/...` URLs and are labelled mock in the UI. Three samples: pricing, API versions, leadership + regulation.

## Data model

One table: `checks(id TEXT PRIMARY KEY, created_at TEXT, data TEXT)` where `data` is the Check JSON from the contract. Post-MVP: `claim_cache(key TEXT PRIMARY KEY, created_at TEXT, data TEXT)`.

## Config (`.env`)

`MOCK_MODE`, `BIFROST_BASE_URL`, `BIFROST_API_KEY` (optional), `BIFROST_VIRTUAL_KEY` (optional), `MODEL_EXTRACT`, `MODEL_JUDGE`, `MODEL_ANSWER`, `MODEL_FALLBACKS`, `TAVILY_API_KEY`, `MAX_CLAIMS`, `DATABASE_PATH`, `CACHE_ENABLED` (post-MVP, T023). Provider keys (`OPENAI_API_KEY`, …) are read by Bifrost, never by the app.

## Demo story

1. Paste the "pricing" sample → claims light up one by one; two turn red with the current price and dated sources.
2. Open a claim → breakdown, sources, "served by" line.
3. Ask mode: ask a question, watch the model answer, then watch StaleGuard catch what is out of date and offer a corrected answer.
4. Show the Bifrost dashboard (requests per stage, failover) and the Tavily sources.

## Gates

| Gate | Command (from repo root) |
|---|---|
| Backend lint | `cd backend && uv run ruff check .` |
| Backend tests | `cd backend && uv run pytest -q` |
| Frontend build (typecheck + bundle) | `cd frontend && npm run build` |
| Frontend lint | `cd frontend && npm run lint` |
