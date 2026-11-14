# Decisions log

One line per decision, newest last. Times in Malaysia time (UTC+8).

| When | Decision | Why |
|---|---|---|
| 14 Nov 20:50 | **Problem statement: PS06, stale-answer detector (Tavily + Bifrost).** Scores (build / judging / demo / sponsors / risk): PS01 15, PS02 17, PS03 13, PS04 12, PS05 21, **PS06 24**. | Both sponsors are mandatory and natural, four crisp requirements, keyless mock mode is easy, very visual demo, lowest risk in 30 h. |
| 14 Nov 20:55 | Project name: **StaleGuard**. | Says what it does. |
| 14 Nov 21:00 | Stack stays the default: FastAPI + Vite/React/TS + SQLite. Backend managed with `uv`. Plain CSS, no UI library. | Nothing in PS06 needs more. |
| 14 Nov 21:00 | Tavily through its REST API with httpx, no SDK. | One endpoint; one less dependency. |
| 14 Nov 21:05 | Progress by polling `GET /api/checks/{id}` every second, not SSE or websockets. | Same progressive UI, far less code. |
| 14 Nov 21:05 | Mock fixtures use fictional companies and example.com URLs. | Never present invented facts about real companies as verified. |
| 14 Nov 21:10 | Spec Kit installed and initialised; constitution, spec, plan and tasks written straight into the Spec Kit layout instead of running each `/speckit-*` command. `/speckit-clarify` skipped; analysis done as the coverage table in tasks.md. | Time. |
| 14 Nov 21:10 | Install steps 2–6 of the kit (extra plugins, MCP servers) skipped. | They only load after a restart and nothing in the build depends on them; the skills this session already has cover deck, design and browser checks. |
| 14 Nov 21:10 | Parallel batches run in the same working tree on disjoint folders (`backend/` vs `frontend/` vs root files), not in git worktrees. | Disjoint paths give the same isolation with no merge step. |
| 14 Nov 21:10 | Time boxes: MVP by 15 Nov 00:00, post-MVP by 03:00, ship artefacts by 06:00. Hard feature freeze 15 Nov 20:29; submission deadline 16 Nov 02:29. | 29.9 h left at start. |
