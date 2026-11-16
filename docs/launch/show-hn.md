DRAFT, not posted. A human posts this, on a weekday, and stays around to answer comments. Replace the bracketed items before posting.

# Show HN draft

Rules (news.ycombinator.com/showhn.html): it must be something people can try, not a landing page or a sign-up wall. Plain title, no superlatives.

## Title

Show HN: StaleGuard - find outdated claims in LLM answers via live web search

## URL

https://github.com/6rzan/StaleGuard

## First comment (post right after submitting)

Hi HN, we built StaleGuard because LLM answers often state prices, versions, laws and job titles that were true when the model was trained and are wrong now, and nothing in the answer tells you which sentences to doubt.

It takes an answer (pasted, or generated from a question), picks out the claims that can go stale, searches the live web for each one with Tavily, and has a model judge the claim against the sources. Each claim gets a 0 to 100 freshness score with a visible breakdown, the dated sources, and the current value when the claim is outdated. Try it: `git clone https://github.com/6rzan/StaleGuard && cd StaleGuard && docker compose up`, then open http://localhost:8000. That starts in mock mode: no keys, bundled fictional fixtures, so it shows the flow but does not check real facts.

How it works: models are called through the Bifrost gateway, so extraction, judging and answering can each use a different model, with fallbacks configured in one place. The score is not produced by a model. The model returns a verdict, a confidence and a stance per source, and a fixed formula (source age against a half-life per category, agreement, confidence) turns that into the number. Claims must be exact substrings of the answer, and a claim with no sources is reported as unverified instead of guessed.

What it doesn't do yet: the live path (real Bifrost, Groq and Tavily calls) was verified by the team on one set of keys, so we would like to hear about failures with yours. English only, no authentication, and results depend on the models you configure. Bifrost's MCP gateway, so the model can call Tavily as a tool, is the next step.

We'd love feedback on whether a fixed half-life per category (90 days for prices, a year for statistics) is a sensible way to score staleness, and what you would use instead.
