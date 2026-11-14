# Validation log

Each batch is accepted only after the diff was read and the gates were run by the reviewer, not on the implementer's word.

## B1: repo setup (T001–T004), accepted 14 Nov 20:52

- Checked: every file against the task list; `.env.example` has no key values; CI uses only the gate commands; no file outside the list.
- CI workflow held back until `backend/` and `frontend/` existed; first run green (run 43598145149: backend and frontend jobs, all steps).

## B2: backend, mocks and tests (T005–T015), accepted 14 Nov 21:00, one rework round

- Gates: `ruff check` clean; `pytest` 47 passed, then 56 passed after rework; no network, no env vars.
- Checked: contract shapes field for field, score formula against plan.md, per-claim error isolation, input limits (422), 202 + polling path.
- Rework (7 findings, all fixed with tests): outer guard so a check can never stay stuck in a running status; scoring tolerant of naive or unreadable dates; JSON wrapped in prose is parsed; gateway and search errors carry the server message with keys masked; mock claims finish one by one; gateway default on 127.0.0.1; extract prompt gets today's date and a 15-claim cap.
- SC-001: the three samples give pinned labels (pricing: stale 10, fresh 91, unverified 43; api-versions: stale 9, review 73, fresh 94; leadership-regulation: stale 10, fresh 90, unverified 50).
- SC-002 (mock): full sample in 0.96–1.26 s (limit 3 s). Live timing is measured by the smoke test once keys exist.
- Not verified: real Bifrost and Tavily calls (no keys on the build machine); both clients are tested against a mocked transport built from the current docs.

## B3: frontend MVP (T016–T020), accepted 14 Nov 21:06

- Gates: `npm run lint` 0 warnings; `npm run build` (strict `tsc -b` + Vite) clean.
- Browser review against the mock backend at 1280 px and 375 px: samples load, submit, report, claim cards, evidence, history; no horizontal scroll at 375 px; no tap target under 40 px; console empty (SC-004).
- Findings carried into T027: proxy target on 127.0.0.1, duplicate "no sources" text, sponsor names in the UI, no-claims state, claim tag wrapping.

## B4: ask mode, corrected answer, cache, Docker, smoke test (T021–T025), accepted 14 Nov 21:57

- Gates: `ruff check` clean; `pytest` 70 passed (14 new), no network.
- Checked in the diff: generation, rewrite and cache all sit inside the existing error isolation; a rewrite failure leaves `corrected_answer` null and the check `done`; only verifications backed by sources are cached; TTL by volatility; the contract is unchanged.
- Security review finding fixed before acceptance: compose ports are published on 127.0.0.1 only, because the gateway container holds the provider keys.
- Browser, mock backend: ask mode end to end (stages answer, extract, judge, rewrite), second run of the same question shows 2 cache hits and "cached" tags with the same scores.
- Docker: Docker Desktop does not start on the build machine, so the container path is verified in CI instead. The `docker` job builds the image, starts it, and asserts health, the UI at `/` and a full mock check (first green run: the commit "ci: build the Docker image and smoke-test the container").
- Deviation accepted: on a second run the pricing and leadership samples still make one search each, for the claim that has no sources (never cached by design).
- Not verified: `python -m app.smoke` against a real gateway and real Tavily (no keys); the Bifrost container itself (`--profile live`) has not been started anywhere.
- Note: the implementer was interrupted once by a usage limit and resumed in the same session; T021–T023 and T025 were finished before, T024 after.

## B5: UI extras and polish (T026–T027), accepted 14 Nov 21:57

- Gates: lint 0 warnings; strict build clean; no new dependency.
- Browser at 1280 px and 375 px against the real mock backend: mode switch, ask flow with the generating state, corrected answer panel with word diff ($20 to $25), cached tags and cache-hit count, Download report button present, sponsor labels by mode, claim tags stay attached to their span; no horizontal scroll, no tap target under 40 px, console empty.
- Not verified by the reviewer: the clipboard copy succeeding and the saved report file (browser pane blocks both); the report text was checked by the implementer.
