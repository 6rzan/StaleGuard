# Changelog

All notable changes to this project are documented here.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versions: [Semantic Versioning](https://semver.org/).

## [Unreleased]

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

[Unreleased]: https://github.com/6rzan/ai-global-hackathon/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/6rzan/ai-global-hackathon/releases/tag/v0.1.0
