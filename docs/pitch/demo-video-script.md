# Demo video script (about 2 min 40 s)

Live mode, real keys. Follows the demo story in `specs/001-stale-answer-detector/plan.md`. Header badge must read "Live: Bifrost + Tavily" before you start; if it says "Mock data", stop and fix `.env` (see `docs/OWNER_TODO.md`).

## Before recording

- `make smoke` prints PASS on all three lines.
- Bifrost is running and its dashboard is open in a second tab at http://localhost:8080.
- App open at http://localhost:8000 (Docker) or http://localhost:5173 (dev servers), history empty or irrelevant, `CACHE_ENABLED=false` so every step does real searches and the timing on screen is honest.
- Rehearse steps 2 and 4 once. The sample text below uses real, fast-changing facts, but live verdicts depend on the models and on what Tavily returns that day. If a claim does not come back stale during rehearsal, swap in another fast-changing fact (a software version, a plan price) and keep the rest of the script.
- The bundled samples (Northwind Cloud and others) are fictional mock data. Do not use them in the live video, because the web has nothing on them.

## Script

| Time | On screen | Speaker says |
|---|---|---|
| 0:00 to 0:15 | The empty app, header badge "Live: Bifrost + Tavily". | "LLM answers sound sure of themselves even when the facts have moved on. A price, a version number, a law. StaleGuard finds the claims that can go stale and checks them against the live web." |
| 0:15 to 0:50 | Pick the "Check an answer" tab. Paste: `The latest stable version of Python is 3.12. Node.js 18 is the current long-term support release. The free plan allows 100 requests per day.` Click "Check freshness". Claims highlight in the answer one by one. | "Here is an answer a model could have given a year ago. StaleGuard splits it into claims and marks which ones can change. The version claims are time-sensitive, so each gets a web search through Tavily. The free plan sentence has no named product, so there is nothing to verify and it stays unverified or skipped. That is on purpose: we do not guess." |
| 0:50 to 1:25 | The two version claims show red (stale) with the current value and dated sources. Overall score at the top. Click the Python claim to open it. | "Two claims are stale. For each one we show the value the sources give now, with source titles and dates. Open a claim and you see the score breakdown: how recent the sources are, how many agree, how confident the judge was. The score itself is a fixed formula, not a model's opinion, so the same evidence gives the same number." |
| 1:25 to 1:40 | Click "Download report" in the summary, then show the corrected answer panel and its diff toggle. | "The corrected answer changes only the outdated statements. The report downloads as Markdown, so it can go into a ticket or a review." |
| 1:40 to 2:10 | Switch to "Ask a model". Type: `What is the latest stable version of Python, and which Node.js version is the current LTS?` Click "Ask and check". The model's answer appears, then the claims fill in. | "Ask mode removes the paste step. A model answers the question, and StaleGuard checks the answer straight away. If the model's training data is old, you watch it get caught. This is the same API a team can call as a verification step: one POST, and the finished report comes back as JSON." |
| 2:10 to 2:25 | Scroll to the usage strip "Models via Bifrost gateway": one entry per stage with its model, a fallback tag if one answered, and the totals for tokens, searches and duration. | "Every model call goes through Bifrost. Extraction and judging run on an open-weight model on Groq, the answer comes from Grok on xAI, and the strip lists the model for each stage. If Groq fails, Grok answers instead and the entry is tagged with the model that served it." |
| 2:25 to 2:40 | Switch to the Bifrost dashboard tab, showing the requests just made. Then back to a claim's sources list, with the domain and date on each source. | "Here are the same requests in the Bifrost dashboard, and here are the Tavily sources behind every verdict. StaleGuard is open source under the MIT license. The repo link is in the description." |

## After recording

- Put the link in `README.md` at `<!-- DEMO VIDEO LINK -->` and in the HackCulture form.
- Keep the recording under 3 minutes. If it runs over, cut the report download (1:25 to 1:40) first.
