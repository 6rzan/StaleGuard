# StaleGuard

StaleGuard helps developers catch outdated facts in LLM answers: it finds time-sensitive claims, re-checks them against the live web and scores how fresh each one is.

<!-- DEMO GIF -->

## Quick start

```bash
git clone https://github.com/6rzan/ai-global-hackathon && cd ai-global-hackathon && docker compose up
# Without Docker, in two terminals (MOCK_MODE=true needs no keys):
cp .env.example .env
make dev-backend
make dev-frontend
```

## Features

- Extracts factual claims from an LLM answer as exact text spans, classified by category.
- Flags the time-sensitive ones with a volatility level and a reason.
- Verifies each flagged claim with Tavily web search and an LLM judge routed through Bifrost.
- Scores every claim 0-100 with a visible breakdown, dated sources and the current value when outdated.
- Mock mode, check history and a JSON API (`POST /api/checks?wait=true`) for use as a verification layer.

Status: hackathon build, Global AI Hackathon 2026 (PS06)
