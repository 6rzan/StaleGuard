# Changelog

All notable changes to this project are documented here.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versions: [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added
- MVP: paste an LLM answer and get its time-sensitive claims extracted, classified and highlighted.
- Live verification of each flagged claim with Tavily search and an LLM judge routed through Bifrost.
- Deterministic 0-100 freshness score per claim with a visible breakdown and dated sources.
- Mock mode with bundled fixtures, so the full flow and CI run without API keys.
- SQLite check history and a `POST /api/checks?wait=true` endpoint for use as a verification layer.
