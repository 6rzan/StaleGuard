# Decisions log

One line per decision, newest last. Times in Malaysia time (UTC+8).

| When | Decision | Why |
|---|---|---|
| 14 Nov 20:40 | **Problem statement: PS06, stale-answer detector (Tavily + Bifrost).** Scores (build / judging / demo / sponsors / risk): PS01 15, PS02 17, PS03 13, PS04 12, PS05 21, **PS06 24**. | Both sponsors are mandatory and natural, four crisp requirements, keyless mock mode is easy, very visual demo, lowest risk in 30 h. |
| 14 Nov 20:41 | Project name: **StaleGuard**. | Says what it does. |
| 14 Nov 20:44 | Stack stays the default: FastAPI + Vite/React/TS + SQLite. Backend managed with `uv`. Plain CSS, no UI library. | Nothing in PS06 needs more. |
| 14 Nov 20:44 | Tavily through its REST API with httpx, no SDK. | One endpoint; one less dependency. |
| 14 Nov 20:45 | Progress by polling `GET /api/checks/{id}` every second, not SSE or websockets. | Same progressive UI, far less code. |
| 14 Nov 20:45 | Mock fixtures use fictional companies and example.com URLs. | Never present invented facts about real companies as verified. |
| 14 Nov 20:47 | Spec Kit installed and initialised; constitution, spec, plan and tasks written straight into the Spec Kit layout instead of running each `/speckit-*` command. `/speckit-clarify` skipped. `/speckit-analyze` run once at 20:56: 0 critical, 4 medium, 3 low; all fixed in the artefacts. | Time. |
| 14 Nov 20:58 | Kit install steps 1–6 all done and verified: orchestrate-implement, repo-launch-checklist, Spec Kit, karpathy-guidelines, frontend-design, security-guidance, pyright-lsp, typescript-lsp, diagram-design, humanizer, hallmark, make-interfaces-feel-better; MCP servers chrome-devtools, playwright, context7. The document-skills plugin was not installed separately. | The session already has the pptx/docx skills; the marketplace is added if they are wanted later. `gitleaks` is not installed, so the audit uses its built-in secret scan. |
| 14 Nov 20:47 | Parallel batches run in the same working tree on disjoint folders (`backend/` vs `frontend/` vs root files), not in git worktrees. | Disjoint paths give the same isolation with no merge step. |
| 14 Nov 20:47 | Time boxes: MVP by 14 Nov 23:00, post-MVP by 15 Nov 01:00, ship artefacts by 04:00. Hard feature freeze 15 Nov 20:29; submission deadline 16 Nov 02:29. | 29.9 h left at start (20:36). |
| 14 Nov 20:52 | The CI workflow is committed only once `backend/` and `frontend/` exist. | Avoids a red first run. |
| 14 Nov 20:52 | `gh repo edit` (description, topics, Discussions) returns 404 for this account (write, not admin). Commands go to `docs/OWNER_TODO.md` for Taha. | No admin permission. |
| 14 Nov 21:07 | MVP (T001–T020) accepted, on `main`, CI green. Review notes in `specs/001-stale-answer-detector/validation.md`. | 30 minutes after start; the rest of the time goes to post-MVP features, polish and the submission material. |
| 14 Nov 21:40 | The Bifrost container sits behind a compose profile (`live`). `docker compose up` starts only the app in mock mode; `docker compose --profile live up` adds the gateway. | A keyless first run must never depend on the gateway starting without provider keys. |
| 14 Nov 21:55 | Compose ports are bound to 127.0.0.1. | The gateway holds provider keys and has no auth of its own by default. |
| 14 Nov 21:58 | Docker Desktop does not start on the build machine, so the image is verified by a `docker` job in CI (build, run, health, full mock check). | The README's first command has to be proven somewhere. |
| 14 Nov 22:05 | All post-MVP tasks (T021–T027) accepted, CI green on three jobs. Remaining: README, media, deck, launch items. | 1.5 h after start. |
| 14 Nov 22:28 | Released `v0.1.0` on the commit with three green CI jobs. Launch audit: PASS 1 at the start, PASS 11 now. The five open items need the repo owner (description, topics, Discussions, social preview) or the team (demo video link); all are in `docs/OWNER_TODO.md`. | Build finished 1 h 52 min after start; 28 h remain before the deadline for keys, the smoke test, the video and the submission. |
