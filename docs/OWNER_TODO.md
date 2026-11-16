# Owner to-do

Things the build account cannot do (it has write access to the repo, not admin). Each item says who does it and gives the exact command or steps. Commands need the GitHub CLI (`gh auth login` as the repo owner) and use the repository `6rzan/StaleGuard`.

## Taha (repo owner): before going public, in this order

### 1. Set the description, topics and Discussions

```bash
gh repo edit 6rzan/StaleGuard --description "StaleGuard: a stale-answer detector that finds outdated claims in LLM answers, re-verifies them on the live web (Tavily) through the Bifrost gateway, and scores their freshness." --add-topic ai,llm,fact-checking,hallucination-detection,tavily,bifrost,fastapi,react,hackathon --enable-discussions
```

### 2. Merge the release

Merge the `release/v0.2.0` pull request into `main` once the `backend`, `frontend`, `e2e` and `docker` checks are green, then tag it: `git tag v0.2.0 && git push origin v0.2.0`.

### 3. Run the launch audit

From the repo root. Read the secret scan line; do not continue unless it says PASS.

```bash
node ~/.claude/skills/repo-launch-checklist/scripts/audit.mjs --repo .
```

### 4. Make the repo public

```bash
gh repo edit 6rzan/StaleGuard --visibility public --accept-visibility-change-consequences
```

### 5. Turn on secret scanning and push protection

```bash
gh api -X PATCH repos/6rzan/StaleGuard   -f 'security_and_analysis[secret_scanning][status]=enabled'   -f 'security_and_analysis[secret_scanning_push_protection][status]=enabled'
```

### 6. Turn on Dependabot alerts and security updates

`.github/dependabot.yml` already schedules weekly version updates. These two calls enable the alerts and the automatic security pull requests:

```bash
gh api -X PUT repos/6rzan/StaleGuard/vulnerability-alerts
gh api -X PUT repos/6rzan/StaleGuard/automated-security-fixes
```

### 7. Turn on private vulnerability reporting

`.github/SECURITY.md` tells people to use it.

```bash
gh api -X PUT repos/6rzan/StaleGuard/private-vulnerability-reporting
```

### 8. Protect `main`

Require a pull request and passing CI. The check names are the job names in `.github/workflows/ci.yml`. The approval count is 0 so the owner can merge their own pull request; raise it to 1 once a second reviewer is active.

```bash
gh api -X PUT repos/6rzan/StaleGuard/branches/main/protection --input - <<'JSON'
{
  "required_status_checks": { "strict": true, "contexts": ["backend", "frontend", "e2e", "docker"] },
  "enforce_admins": false,
  "required_pull_request_reviews": { "required_approving_review_count": 0 },
  "restrictions": null
}
JSON
```

### 9. Upload the social preview image (manual)

GitHub has no API for this. In the repo: Settings, General, Social preview, Edit, upload `docs/media/social-preview.png`.

### 10. Set the homepage to the demo video

```bash
gh repo edit 6rzan/StaleGuard --homepage "https://youtu.be/an9OuJ4WdCw"
```

## The team

### 11. Add real keys

Put them in `.env` on the machine that records the demo (copy from `.env.example`). Never commit `.env`.

| Key | Where to get it |
|---|---|
| `TAVILY_API_KEY` | https://app.tavily.com |
| `GROQ_API_KEY` | https://console.groq.com/keys (extract, judge, rewrite) |
| `BIFROST_VIRTUAL_KEY` | Make it yourself: `echo sk-bf-$(openssl rand -hex 24)`. Required in live mode; must start with `sk-bf-`. |
| `BIFROST_SETUP_TOKEN` | Make it yourself: `openssl rand -hex 32`. Only to create the dashboard admin account. |

Also set `MOCK_MODE=false`. `BIFROST_API_KEY` is optional.

To open the Bifrost dashboard (needed for the demo video):

1. Put `BIFROST_SETUP_TOKEN` in `.env` and start the gateway.
2. Open http://localhost:8080.
3. Go to Workspace, Config, Security.
4. Turn on password protection.
5. Paste the setup token when asked.

### 12. Run the smoke test

Passed on 15 Nov 2026 with real keys: bifrost (served by `groq/openai/gpt-oss-120b`, about 1.3 s), tavily (5 results) and check all PASS. Re-run it if you change keys or models.

Done 15 Nov: `openai/gpt-oss-20b` is enabled in the Groq project, and the gateway's failover to it on rate limits was tested (8 of 8 burst requests succeeded, 3 served by the fallback).

When recording, wait about a minute between live checks: the Groq free tier allows about 8,000 tokens per minute and back-to-back checks can hit HTTP 429.

```bash
docker compose --profile live up bifrost    # or: npx -y @maximhq/bifrost -app-dir ./bifrost
make smoke                                  # without make: cd backend && uv run python -m app.smoke
```

Without `make`, the dev servers are `cd backend && uv run uvicorn app.main:app --reload --port 8000` and `cd frontend && npm run dev`.

The Bifrost container (`--profile live`) has been started in WSL Docker and loads `bifrost/config.json`. If it does not come up, use `npx -y @maximhq/bifrost -app-dir ./bifrost` with the three keys exported in that shell.

All three lines (`bifrost`, `tavily`, `check`) must start with PASS. If one says FAIL, the message says what to check. Fix that before recording anything.

### Docker on the build machine

Docker Desktop does not start on the build machine. Docker Engine runs inside WSL (Ubuntu), where the app image and the live-profile gateway were built and started; the CI `docker` job checks the image on every push too.

### 13. Record the demo video

Done 15 Nov: `docs/media/staleguard-demo.mp4` (2:14, 1920x1080, narrated, captioned). It is cut from a screen recording of the app in live mode (Groq through Bifrost, Tavily) made with `scripts/record-video.mjs`, with Taha's cloned voice as narration. Uploaded to YouTube: https://youtu.be/an9OuJ4WdCw

### 14. Put the video link in the README

Done: the README links the YouTube video and the MP4 in the repo. For the HackCulture form use https://youtu.be/an9OuJ4WdCw

## Esam (team leader)

### 15. Submit on HackCulture

Submit at least 2 hours before the deadline, 15 Nov 2026 23:59 IST (16 Nov 2026 02:29 MYT). In the form:

- Theme: "AI Agents & Intelligent Systems"
- Problem Statement: "Build a Stale-Answer Detector for AI Applications" (PS06; it requires both Tavily and Bifrost, and StaleGuard uses both)
- Project Title: StaleGuard
- Github link: https://github.com/6rzan/StaleGuard (must be public by then, see item 4)
- Demo Video Link: the one from item 14
- PPT File: `docs/pitch/StaleGuard-pitch.pptx` from `main`
- "Are you also integrating a Tavily problem statement into your project?": leave both boxes empty. That question is for projects whose primary statement is a Bifrost one; ours already is the Tavily statement.
- "Submitting two separate projects?": tick "NA (not applied)" and leave every 2nd-project field empty. This is one project; Bifrost is part of it, not a second submission.
