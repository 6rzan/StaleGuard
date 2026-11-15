# Changelog

All notable changes to this project are documented here.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versions: [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.2.0] - 2026-11-15

Live providers, a gateway virtual key, a redesigned interface and an end-to-end test suite.

### Added
- Groq as the only live provider: `groq/openai/gpt-oss-120b` for every stage, with `groq/openai/gpt-oss-20b` as the gateway's failover on rate limits. The "Models via Bifrost gateway" strip tags a call served by the fallback.
- A Bifrost virtual key for the app (`vk-staleguard`, sent as `x-bf-vk`) with a budget of 5 USD per day, 60 requests per minute and only the two configured models allowed. `BIFROST_VIRTUAL_KEY` and `BIFROST_SETUP_TOKEN` in `.env.example`.
- Dark developer-tool interface: landing page with navigation, hero, features, code preview and integrations, wrapped around the existing checker, report and claim cards.
- Demo GIF and screenshots recorded with live data (Groq and Tavily), and a new social preview image.
- Playwright end-to-end suite (`npm run test:e2e`): 34 tests in Chromium against a mock-mode backend, with page objects, an axe accessibility audit, responsive and console checks, plus one opt-in live test (`LIVE_E2E=1`). Runs in CI as the `e2e` job.
- QA report (`docs/QA_REPORT.md`) and a pull request template, security policy and Dependabot configuration.
- Docker Engine and Compose inside WSL, documented for Windows.

### Changed
- Tavily searches ask for the most recent sources first, and the judge ignores sources older than the claim.
- Requests the gateway rejects with HTTP 429 are retried up to 2 more times, waiting `Retry-After` (at most 10 s) or 2 s then 4 s.
- Backend tests: 84 (72 in 0.1.0), covering time filters, 429 retries and Groq-only fallbacks.
- The smoke test names the Groq key and the virtual key in its hints.
- Docs describe the live path as verified: smoke test, full checks and the gateway failover all ran against real keys on 15 Nov 2026.

### Fixed
- Claim highlights in the answer have an accessible name that matches their visible text (WCAG 2.5.3 Label in Name).
- The smoke test points at the virtual key when the gateway answers 401.
- The landing page stat shows the real backend test count.

### Security
- The gateway keeps authentication on for inference; the app uses its own virtual key. Checked in Docker: no key and a wrong key return 401, a model outside the allow-list returns 403.
- Provider keys stay in the Bifrost container; the app never holds them.

## [0.1.0] - 2026-11-14

First release, built for the Global AI Hackathon 2026 (PS06, Tavily + Bifrost).

### Added
- Paste an LLM answer and get its time-sensitive claims extracted, classified and highlighted.
- Verification of each flagged claim with Tavily search and an LLM judge routed through the Bifrost gateway, with per-stage models and fallbacks.
- Deterministic 0-100 freshness score per claim with a visible breakdown and dated sources.
- Ask mode: a model answers a question, then the answer is checked.
- Corrected answer for outdated claims, with a word diff against the original.
- Claim cache with a lifetime by volatility (6 hours, 24 hours, 7 days).
- Markdown report export and SQLite check history.
- `POST /api/checks?wait=true` for use as a verification layer by other tools.
- Mock mode with bundled fictional fixtures, so the full flow, the tests and CI run without API keys.
- Docker image and Compose file; the Bifrost container sits behind the `live` profile.
- Smoke test (`python -m app.smoke`) for the live Bifrost and Tavily path.

### Known limitations
- The live path has only been tested against mocked HTTP transports; run the smoke test with real keys first.
- English only, no authentication.

[Unreleased]: https://github.com/6rzan/ai-global-hackathon/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/6rzan/ai-global-hackathon/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/6rzan/ai-global-hackathon/releases/tag/v0.1.0
