# Owner to-do

Things the build account cannot do (it has write access to the repo, not admin). Each item says who does it and gives the exact command or steps.

## Taha (repo owner)

### 1. Set the repo description, topics and Discussions

```bash
gh repo edit 6rzan/ai-global-hackathon --description "StaleGuard: a stale-answer detector that finds outdated claims in LLM answers, re-verifies them on the live web (Tavily) through the Bifrost gateway, and scores their freshness." --add-topic ai,llm,fact-checking,hallucination-detection,tavily,bifrost,fastapi,react,hackathon --enable-discussions
```

### 2. Upload the social preview image

GitHub has no API for this. In the repo: Settings, General, Social preview, Edit, upload `docs/media/social-preview.png`.

### 3. Make the repo public (only after the secret scan passes)

Run the audit from the repo root and read item 9 (secret scan). Do not continue unless it says PASS.

```bash
node ~/.claude/skills/repo-launch-checklist/scripts/audit.mjs --repo .
```

Then:

```bash
gh repo edit 6rzan/ai-global-hackathon --visibility public --accept-visibility-change-consequences
```

After it is public, turn on secret scanning and push protection: Settings, Code security, enable "Secret scanning" and "Push protection".

## The team

### 4. Add real keys

Put them in `.env` on the machine that records the demo (copy from `.env.example`). Never commit `.env`.

| Key | Where to get it |
|---|---|
| `TAVILY_API_KEY` | https://app.tavily.com |
| `GROQ_API_KEY` | https://console.groq.com/keys (extract, judge, rewrite) |
| `XAI_API_KEY` | Optional. https://console.x.ai. Only if you want Grok to write ask-mode answers; then set `MODEL_ANSWER=xai/grok-4.7`. Without it, ask mode uses `gpt-oss-120b`. |

| `BIFROST_VIRTUAL_KEY` | Make it yourself: `echo sk-bf-$(openssl rand -hex 24)`. Required in live mode; must start with `sk-bf-`. |
| `BIFROST_SETUP_TOKEN` | Make it yourself: `openssl rand -hex 32`. Only to create the dashboard admin account. |

Also set `MOCK_MODE=false`. `BIFROST_API_KEY` is optional.

To open the Bifrost dashboard (needed for the demo video):

1. Put `BIFROST_SETUP_TOKEN` in `.env` and start the gateway.
2. Open http://localhost:8080.
3. Go to Workspace, Config, Security.
4. Turn on password protection.
5. Paste the setup token when asked.

### 5. Run the smoke test

Passed on 15 Nov 2026 with real keys: bifrost (served by `groq/openai/gpt-oss-120b`, about 1.3 s), tavily (5 results) and check all PASS. Re-run it if you change keys or models.

To do: enable `openai/gpt-oss-20b` in the Groq project (console.groq.com, project settings, models) so the gateway can fail over on rate limits. Today Groq answers "blocked at the project level" for it.

When recording, wait about a minute between live checks: the Groq free tier allows about 8,000 tokens per minute and back-to-back checks can hit HTTP 429.

```bash
docker compose --profile live up bifrost    # or: npx -y @maximhq/bifrost -app-dir ./bifrost
make smoke                                  # without make: cd backend && uv run python -m app.smoke
```

Without `make`, the dev servers are `cd backend && uv run uvicorn app.main:app --reload --port 8000` and `cd frontend && npm run dev`.

The Bifrost container (`--profile live`) has been started in WSL Docker and loads `bifrost/config.json`. If it does not come up, use `npx -y @maximhq/bifrost -app-dir ./bifrost` with the three keys exported in that shell.

All three lines (`bifrost`, `tavily`, `check`) must start with PASS. If one says FAIL, the message says what to check. Fix that before recording anything.

### Docker on the build machine

Docker Desktop could not start on the build machine because WSL is not installed. The container is verified by the CI `docker` job instead. To run it locally: `wsl --install` in an administrator PowerShell, reboot, then start Docker Desktop.

### 6. Record the demo video

Follow `docs/pitch/demo-video-script.md` (2 to 3 minutes, live mode). Rehearse once first, because live answers depend on the models.

### 7. Put the video link in the README

In `README.md`, replace `<!-- DEMO VIDEO LINK -->` with the link, for example `[Watch on YouTube](https://...)`.

## Esam (team leader)

### 8. Submit on HackCulture

Submit at least 2 hours before the deadline, 15 Nov 2026 23:59 IST (16 Nov 2026 02:29 MYT). In the form:

- Theme: PS06
- Tick "Tavily integration"
- Repository link: https://github.com/6rzan/ai-global-hackathon (must be public by then, see item 3)
- Deck: the files in `docs/pitch/`
- Video link: the one from item 7
