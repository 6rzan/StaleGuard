# Contributing to StaleGuard

Thanks for helping. Small, focused pull requests get merged fastest.

## Run it locally

```bash
git clone https://github.com/6rzan/ai-global-hackathon.git
cd ai-global-hackathon
cd backend && uv sync && cd ../frontend && npm ci && cd ..
cp .env.example .env       # MOCK_MODE=true works without keys; never commit .env
make dev-backend           # terminal 1, http://localhost:8000
make dev-frontend          # terminal 2, http://localhost:5173
```

## Before you open a PR

```bash
make test                          # backend lint and tests (107), frontend lint
make build                         # frontend type check and bundle
cd frontend && npm run test:e2e    # Playwright, 37 tests in Chromium, mock mode
```

The first end-to-end run needs the browser: `cd frontend && npx playwright install chromium`.

1. Open an issue first for anything bigger than a small fix, so we can agree on the approach.
2. Branch from `main`, one change per PR, and describe what changed and how you tested it.
3. Add or update tests for behaviour you change.
4. CI must be green before review.

## Where to start

Issues labelled [`good first issue`](https://github.com/6rzan/ai-global-hackathon/labels/good%20first%20issue) are small and scoped. Report security problems privately, see [SECURITY.md](.github/SECURITY.md). Questions go to [Discussions](https://github.com/6rzan/ai-global-hackathon/discussions); bugs go to Issues.

## Response time

We aim to reply to every new issue and PR within one business day.
