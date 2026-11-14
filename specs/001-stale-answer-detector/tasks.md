# Tasks: StaleGuard (001-stale-answer-detector)

Inputs: [spec.md](spec.md), [plan.md](plan.md), [contracts/api.md](contracts/api.md). Owners per [docs/TEAM.md](../../docs/TEAM.md). Tick a task only when its check passed.

## Standing rules for the implementer

- Build exactly what the task says, matching `contracts/api.md` field for field. No extra features, options or abstractions.
- Never commit, push, switch branch, or touch `.env`. Never add a secret or a real API key anywhere.
- Everything must run with no keys: `MOCK_MODE=true` is the default and tests never hit the network.
- Stay inside the files your batch lists. If you need to change another file, say so in the report instead.
- New dependencies only when the plan names them.
- Run the gates in `plan.md` for what you touched before reporting. Report honestly: failing is fine, hiding it is not.
- No mention of AI tools in code comments or commit-like text.

## Phase 1 — Repo setup

- [ ] T001 [Esam] Root files: `.gitignore` additions, `.env.example` (every variable in plan.md "Config", placeholders only), `LICENSE` (MIT, "StaleGuard contributors"), `Makefile` (`dev-backend`, `dev-frontend`, `test`, `build`, `smoke`)
- [ ] T002 [Esam] Community files: `CONTRIBUTING.md`, `.github/ISSUE_TEMPLATE/{bug_report.yml,feature_request.yml,config.yml}`, `.github/SUPPORT.md`, `CHANGELOG.md`
- [ ] T003 [Esam] `.github/workflows/ci.yml`: backend (uv, ruff, pytest) and frontend (npm ci, lint, build) jobs, mock mode, no secrets
- [ ] T004 [Esam] `README.md` top: H1, one-line description, one install/run command, `<!-- DEMO GIF -->` placeholder, short feature list

## Phase 2 — Backend core

- [ ] T005 [Taha] `backend/pyproject.toml`, `app/main.py`, `app/config.py`; `GET /api/health`
- [ ] T006 [Taha] `app/models.py` (contract shapes) and `app/store.py` (SQLite create/get/list/save)
- [ ] T007 [Taha] `app/scoring.py`: `score_claim`, `label_for`, `overall_score`, `summarize` per plan formula
- [ ] T008 [Taha] `app/llm.py`: `BifrostLLM` — per-stage model, `fallbacks`, optional virtual key, usage + served-by capture, JSON parse with one retry
- [ ] T009 [Taha] `app/search.py`: `TavilySearch` — topic by category, published dates, maps results to `Evidence`
- [ ] T010 [Taha] `app/pipeline.py`: `run_check` — extract → flag → search → judge → score, concurrent, persists progress, per-claim error isolation
- [ ] T011 [Taha] Routes in `app/main.py`: `POST /api/checks` (+`wait`), `GET /api/checks`, `GET /api/checks/{id}`, `GET /api/samples`, CORS for the Vite dev origin, serve `frontend/dist` when it exists

## Phase 3 — Agents, mocks, tests

- [ ] T012 [Saadat] `app/prompts.py` (extract and judge prompts with JSON output spec) and `app/spans.py` (`locate`)
- [ ] T013 [Saadat] `app/mock.py` (`MockLLM`, `MockSearch`) and `app/providers.py` (factory by `MOCK_MODE`)
- [ ] T014 [Saadat] `app/fixtures/samples.json` (3 samples) and `app/fixtures/search.json` (fictional entities, example.com URLs)
- [ ] T015 [Saadat] `backend/tests/`: scoring, spans, pipeline in mock mode (SC-001), API routes, `BifrostLLM` and `TavilySearch` against `httpx.MockTransport` (fallback parsing, error → claim error)

## Phase 4 — Frontend

- [ ] T016 [Alaa] Vite + React + TS scaffold in `frontend/`, `src/types.ts` (contract), `src/api.ts`, dev proxy `/api` → `:8000`, ESLint
- [ ] T017 [Alaa] Input panel: answer textarea, sample chips, submit, validation; `useCheck` polling hook
- [ ] T018 [Alaa] Result view: answer with highlighted claim spans by label, overall score ring, summary counts, progressive states
- [ ] T019 [Alaa] Claim cards: category, score bar, verdict, current value, explanation, evidence links with date and stance, score breakdown; span ⇄ card linking
- [ ] T020 [Alaa] History list, mode badge, model/usage strip (served-by, fallback, tokens, searches, duration), loading/empty/error states, responsive at 375 px, keyboard and screen-reader basics

## ───────── MVP CUT-LINE (everything above is the MVP) ─────────

## Phase 5 — Post-MVP

- [ ] T021 [Taha] Ask mode: `question` without `answer` → generate via `MODEL_ANSWER` (status `generating`), then check
- [ ] T022 [Taha] Corrected answer: rewrite stage fills `corrected_answer` when any claim is outdated (mock: substitute current values)
- [ ] T023 [Taha] Claim cache in SQLite with TTL by volatility (high 6 h, medium 24 h, low 7 d); `cached` flag and `usage.cache_hits`
- [ ] T024 [Taha] `Dockerfile` (build frontend, serve from FastAPI) and `docker-compose.yml` (app + bifrost with `bifrost/config.json` reading provider keys from env); `docker compose up` works in mock mode with no keys
- [ ] T025 [Saadat] `app/smoke.py` (`python -m app.smoke`): one real Bifrost call and one real Tavily call, PASS/FAIL per integration with a clear hint; tests for T021–T023
- [ ] T026 [Alaa] UI: ask-mode toggle, corrected-answer panel with copy, export report (Markdown), cached indicator
- [ ] T027 [Alaa] UI polish: motion on score reveal, empty state, phone-width pass, zero console errors

## Phase 6 — Ship

- [ ] T028 [Esam] Full README: architecture diagram, install (mock, then real keys), Configuration table, how Bifrost and Tavily are used, how AI is used, AI tools used to build this, Team
- [ ] T029 [Esam] `docs/OWNER_TODO.md`, `docs/launch/show-hn.md` (draft only), social preview PNG, demo GIF
- [ ] T030 [Esam] Pitch deck (pptx + PDF) and demo video script in `docs/pitch/`
- [ ] T031 [Esam] Good-first issues, `v0.1.0` tag after CI is green

## Coverage (PS06 → tasks)

| Requirement | Tasks |
|---|---|
| 1 Claim identification | T010, T012, T013, T018 |
| 2 Freshness detection | T012, T013, T019 |
| 3 Live verification (Tavily) | T009, T010, T019 |
| 4 Freshness scoring | T007, T018, T019 |
| Bifrost meaningfully integrated | T008, T020, T021, T024 |
| Runs without keys | T013, T014, T015, T003 |
