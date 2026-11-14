# StaleGuard Constitution

1. **Deadline first.** Submission closes 15 Nov 2026 23:59 IST. Feature freeze 6 h before; after that only fixes, README, deck, video.
2. **MVP before anything else.** Every core requirement of PS06 (claim identification, freshness detection, live verification, freshness scoring) is demoable end to end before any extra is started.
3. **Both sponsors, meaningfully.** Every LLM call goes through the Bifrost gateway; every live verification goes through Tavily. The UI and README show what each contributes.
4. **Runs with no keys.** `MOCK_MODE=true` (the default) runs the app, the tests and CI on deterministic fixtures. Real keys only ever come from `.env`.
5. **No secrets in git.** `.env` is ignored; `.env.example` holds placeholders only. Nothing reads, prints or commits `.env`.
6. **Tests for the core only.** Scoring, claim-span location, the pipeline in mock mode, the API, and the two sponsor clients (against a mocked transport). No test theatre elsewhere.
7. **Smallest thing that works.** No abstraction, option or dependency that a task does not need. Plain SQLite, plain CSS, stdlib where it does the job.
8. **Honest output.** A score is always traceable to evidence: sources, dates and the breakdown are shown. Unverifiable claims say so; mock data is labelled as mock.

**Version**: 1.0.0 | **Ratified**: 2026-11-14
