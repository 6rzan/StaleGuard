# QA report

Date: 15 Nov 2026. Scope: the whole product in mock mode, in Chromium. The live path (Bifrost + Tavily) is covered by one opt-in spec that is not part of these numbers.

## How it was tested

- Suite: Playwright (`@playwright/test`) with `@axe-core/playwright`, in `frontend/e2e/`, page objects in `frontend/e2e/pages/`, config in `frontend/playwright.config.ts`.
- Run it: `cd frontend && npm run test:e2e` (builds the frontend, then starts the real backend with `MOCK_MODE=true` and a fresh temp SQLite file on port 8001, serving `frontend/dist`). Port 8000 is never used. First time on a machine: `npx playwright install chromium`.
- Data is deterministic: mock rules and fixtures. The in-between states (extracting, generating, verifying) are made deterministic by rewriting the first poll responses with `page.route`; everything else is the real backend.
- Every spec runs inside a fixture that fails on any console error, console warning or uncaught exception from the app.
- CI: job `e2e` in `.github/workflows/ci.yml`, report uploaded as an artifact on failure.

## Results

Two full runs, then a run with `--repeat-each=2`, all green and identical, so no flakiness seen: 34 passed and 1 skipped in about 1.1 min (2 workers); 68 passed and 2 skipped in 1.8 min with repeat 2. The skipped test is the `@live` spec (needs `LIVE_E2E=1`, not run here).

| Spec file | Tests | Covers |
|---|---|---|
| `landing.spec.ts` | 5 | nav, hero, "Mock data" badge, copy button (clipboard really holds `docker compose up`), stats, features, how-it-works code window, integrations, footer, nav links scroll to their sections |
| `checker.spec.ts` | 8 | each of the 3 samples: UI overall score, 5 counts, claim texts, order and per-claim scores equal `POST /api/checks?wait=true` for the same answer; span to card by click, Enter and Space; stale card with "Now:", 3 dated sources, score breakdown and formula; timeless and unverified cards; progressive states (extracting, verifying 1 of 3, finished) |
| `ask.spec.ts` | 1 | question, generating state, answer with the question, claims, corrected answer, "Show what changed" shows removed and added words |
| `history.spec.ts` | 1 | finished checks listed, reopening one restores answer, claims and score, survives a reload |
| `export.spec.ts` | 2 | `staleguard-report-<id>.md` downloads with id, score, counts, verified claims, current value, sources, corrected answer; button absent before a check finishes |
| `cache.spec.ts` | 1 | second run of the same answer: "cached" tag, cache hits 1, searches 0, verdict still shown in full |
| `errors.spec.ts` | 7 | empty and blank answer keeps the button disabled; 8001-char paste capped at 8000 with counter "8,000 / 8,000"; API returns 422 for 8001 chars and for an empty body; API unreachable shows the notice, "Offline" badge and Retry, and Retry recovers; submit while down shows a message; a 500 on poll shows Retry and Retry loads the check; unknown id gives 404 |
| `responsive.spec.ts` | 4 | 375, 768, 1440 px: no horizontal scroll on landing and on a finished report, the checker is used end to end; at 375 px every button and call-to-action link is at least 40 px |
| `a11y.spec.ts` | 4 | axe (wcag2a, wcag2aa, wcag21a, wcag21aa, wcag22aa, best-practice) on the landing page, on a finished report with a score breakdown open, and on a report with the diff shown; keyboard path (skip link, chip, submit, span to card) |
| `console.spec.ts` | 1 | one long session (check, diff, ask, history, reload): no console error or warning, no failed or 4xx/5xx request, LCP under 2.5 s, CLS under 0.1 |
| `live.spec.ts` | 1 (skipped) | `@live`, runs only with `LIVE_E2E=1` against `http://127.0.0.1:8000` |

Axe: zero violations of any impact (serious, critical, moderate, minor) on all three audited states after the fix below. Before it: 1 serious. Axe covers roughly a third of WCAG; the keyboard spec adds one manual-style path, but a screen-reader pass was not done.

Breakpoints: 375, 768 and 1440 px pass. Full-page screenshots are written to `frontend/test-results/screens/` on each run (landing and finished report per breakpoint). They were viewed once; there is no committed baseline, so there is no automatic visual diff.

Console: clean in every spec. Specs that break the network on purpose ignore only the browser's own "Failed to load resource" line.

## Findings fixed (in `frontend/src`)

1. Claim spans in the answer (`role="button"`) failed axe `label-content-name-mismatch` (serious, WCAG 2.5.3): the visible text ended with the claim number, which the accessible name did not contain, and the name read "...text.. Go to details" with a double full stop.
   - `src/components/AnswerView.tsx`: the label is now `<claim text> Claim N, <state>. Go to details.`, and the number moved from text to `data-n` on the tag.
   - `src/styles.css`: `.claim-tag::after { content: attr(data-n) }` draws the number. It looks the same; screen readers get the number from the label.

## Findings left

- Tap targets: only buttons and call-to-action links were measured at 375 px (all pass). Text links in the footer and in running text were not, since inline links are exempt from WCAG 2.5.8.
- Core Web Vitals: LCP and CLS are checked on localhost with the production build; INP was not measured.
- Visual regression: no committed baselines, so the three-breakpoint screenshots are inspected, not compared. Verdict for that item is inconclusive by the `browser-qa` rules.
- Dark theme only; there is no light theme to test.
- Chromium only, as requested; Firefox and WebKit are untested.
- The `@live` spec is written but unrun here (Groq free-tier rate limit); the orchestrator runs it.
- Notes, not bugs: the input card section and its textbox share the accessible name "Paste an AI-generated answer" (the section uses the field label as its own label), which is why the page object uses `getByRole("textbox", ...)`.

## browser-qa verdict

SHIP. Smoke: no console errors, no failed requests, LCP and CLS within limits. Interactions: nav links, copy, sample chips, submit, spans to cards, download, retry all work. Accessibility: 0 axe violations. Responsive: no overflow at 375, 768, 1440. Visual: INCONCLUSIVE (no baseline), 0 blockers.

## verification-loop report

```
VERIFICATION REPORT
==================
Build:     PASS  (npm run build: tsc -b and vite build)
Types:     PASS  (0 errors: tsc -b, and tsc -p e2e for the suite)
Lint:      PASS  (oxlint --deny-warnings, 0 warnings; ruff check . passes)
Tests:     PASS  (backend 84/84; e2e 34 passed, 1 skipped @live; repeat-each=2: 68 passed, 2 skipped)
Security:  PASS  (no keys or secrets in the new files; .env never read; no console.log in src; one console.log in e2e/a11y.spec.ts for non-blocking axe notes)
Diff:      10 paths changed or added (see below), no API contract change

Overall:   READY
```

Changed or added: `frontend/e2e/` (new), `frontend/playwright.config.ts` (new), `frontend/package.json` and `package-lock.json` (two devDependencies, one script), `frontend/.gitignore` (Playwright output), `frontend/src/components/AnswerView.tsx` and `frontend/src/styles.css` (the fix above), `.github/workflows/ci.yml` (job `e2e`), `README.md` (one line), `docs/QA_REPORT.md`.

Coverage percentage is not reported: the frontend has no unit-test coverage tooling; the e2e suite is behaviour coverage, not line coverage.

## Live run of the `@live` spec

Run by the reviewer on 15 Nov 2026 with real keys: backend in live mode on port 8000, Bifrost gateway in WSL Docker, Groq `gpt-oss-120b`, Tavily. `LIVE_E2E=1 npx playwright test e2e/live.spec.ts`: 1 passed (12.1 s). The check finished, both claims were verified (no error), sources were listed, and the header badge read "Live: Bifrost + Tavily". The reviewer also reran the mock suite: 34 passed, 1 skipped (56 s).
