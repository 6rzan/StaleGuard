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

## B6: ship material (T028–T031), accepted 14 Nov 22:25

- README (one rework round, 7 accuracy findings fixed): every env variable matches `.env.example`; the UI descriptions were corrected against the components; the AI-tools section states who planned, who wrote and who chose the problem; "Run it with real keys" reordered; raw commands given next to the make targets. The mock commands, the API example and the gates in it were run by the implementer; the gates were rerun by the reviewer (72 tests).
- Media: GIF (960x600, 12.8 s, 2.3 MB) and five stills checked frame by frame on a contact sheet; all are mock-mode runs on a fresh database. `scripts/record-demo.mjs` regenerates them.
- Pitch deck (one rework round): 9 slides with speaker notes; the committed PDF is PowerPoint's own export of the pptx and every page was viewed; screenshots captioned as mock data; slide 8 says the live path has not been run; slide 9 carries the AI-tools disclosure.
- Follow-up fix found while writing the README: the mock rewrite replaced a whole sentence; it now changes only the outdated value (2 new tests).
- Launch audit: PASS 1 at the start, PASS 10 before the release tag. Still open and listed in `docs/OWNER_TODO.md`: GitHub description, topics, Discussions, social preview upload (owner only), demo video link (team).
- Not verified anywhere: a real Bifrost or Tavily call, the Bifrost container (`--profile live`), Docker on the build machine (WSL is not installed there; CI covers the app image).

## B7: providers Groq + xAI, Bifrost virtual key, accepted 15 Nov 03:05 (one follow-up round)

- Gates: ruff clean; pytest 76 passed (4 new: slashed model ids such as `groq/openai/gpt-oss-120b` are not mistaken for fallbacks, a fallback equal to the requested model is dropped, the smoke hint on a virtual-key 401).
- Docker in WSL (Engine 29.1.3): app image built (64 s, 308 MB), health, UI, a full mock check, ask mode, history kept across a restart. Live profile with throwaway keys: Bifrost (image of 10 Nov 2026) loaded `bifrost/config.json`; no virtual key 401, wrong key 401, disallowed model 403, correct key routed to Groq `openai/gpt-oss-120b`, which rejected only the fake provider key. The smoke test in the app container reported both missing pieces with the right hints.
- Not verified: a successful real Groq, xAI or Tavily call (keys not yet added).

## B8: frontend redesign after the DevKit template, accepted 15 Nov 03:20

- Gates: lint 0 warnings; strict build clean; no new npm dependency (Google Fonts link only).
- Reviewer check with Playwright at 1440 px and 375 px: full landing, a full check on the pricing sample, corrected answer, claim cards, history; `scrollWidth` equals the viewport at both widths; console clean. The implementer also ran all three samples, ask mode with diff, history reopen, and an in-page WCAG text-contrast check (337 text nodes, lowest ratio 5.63:1).
- Skills used as the team asked: `ui-ux-pro-max` (style, font pairing, contrast and scroll guidelines) and `impeccable` (shape, craft floor, detector: no findings).

## Live verification, 15 Nov

- `make smoke`: PASS bifrost (served_by `groq/openai/gpt-oss-120b`, about 1.3 s), PASS tavily (5 results), PASS check.
- Real UI in live mode (badge "Live: Bifrost + Tavily"): "Python 3.12 is the latest stable version of Python. The current long-term support release of Node.js is version 20." finished in 13.3 s. Both claims stale (overall scores 7 and 9), current values Python 3.15 and Node.js 26 from dated sources (Wikipedia 8 Aug 2026, herodevs 15 Sep 2026 among them), corrected answer produced, 4 model calls all on `groq/openai/gpt-oss-120b` via Bifrost, 2 searches, 7,158 tokens, no console errors. Screenshots: `docs/media/screenshot-live-report.png`, `docs/media/screenshot-live-claim.png`.
- Recency false positive, found and fixed in B9: "Python 3.15, released in October 2026" came back unverified and a correct model answer saying 3.15.0 was judged outdated, because Tavily returned old pages that the judge counted as contradicting. Fix: Tavily `time_range` by volatility (month, year, none) with one retry unfiltered, and judge rules that an older source cannot contradict a newer claim. Re-run: the claim is no longer marked outdated, and the ask-mode answer is judged against 3.15.2 (25 Oct 2026).
- Rate limits: Groq free tier is about 8,000 tokens per minute on `gpt-oss-120b`; an HTTP 429 ended one claim and one ask-mode run. The app now retries 429 (up to 2 more times). The configured failover `groq/openai/gpt-oss-20b` cannot help yet: Groq answers that the model is blocked at the project level, so it must be enabled in the Groq project settings.
- Not verified: the xAI path (no xAI key; ask mode uses `gpt-oss-120b` via `MODEL_ANSWER`) and failover to `gpt-oss-20b`.
- Backend tests: 84 passed.
