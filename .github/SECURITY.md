# Security policy

## Reporting a vulnerability

Please do not open a public issue for a security problem.

Report it privately with GitHub's private vulnerability reporting: open the repository's **Security** tab, choose **Report a vulnerability**, and describe what you found, how to reproduce it and what it affects. We aim to reply within three business days.

## Scope

In scope:

- The app: the FastAPI backend (`backend/`) and the React frontend (`frontend/`).
- The gateway configuration in `bifrost/config.json` and the Docker files (`Dockerfile`, `docker-compose.yml`), for example a way to bypass the virtual key, its budget or its model allow-list.

Out of scope: vulnerabilities in Bifrost, Tavily, Groq or other third-party services themselves (report those to their maintainers), and the missing authentication in the app, which is a documented limitation (see the README).

## Supported versions

Only the latest release receives security fixes.

## Secrets

Never commit `.env` or any API key. `.env` is git-ignored; only `.env.example` (placeholders) belongs in the repository. If a key was committed or pasted into an issue, revoke it at the provider first, then tell us.
