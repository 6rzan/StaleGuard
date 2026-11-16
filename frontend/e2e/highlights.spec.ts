import type { Check, Claim } from "../src/types";
import { expect, test } from "./fixtures";
import { CheckerPage } from "./pages/CheckerPage";

// The backend counts claim offsets in Unicode code points; the page must cut the answer the same way,
// or every emoji before a claim moves its highlight.
const ID = "aaaaaaaaaaaa";
const ANSWER = "Big news 👍🏽 first. The Pro plan costs 💸 $20 per month today. Team is $25 per user 🇩🇪🇫🇷 and 👨‍👩‍👧 grow.";
const TEXTS = ["The Pro plan costs 💸 $20 per month", "Team is $25 per user 🇩🇪🇫🇷", "👨‍👩‍👧 grow"];

function claim(i: number, text: string): Claim {
  const start = Array.from(ANSWER.slice(0, ANSWER.indexOf(text))).length;
  return {
    id: `c${i + 1}`,
    text,
    start,
    end: start + Array.from(text).length,
    category: "pricing",
    time_sensitive: true,
    volatility: "high",
    risk_reason: "Prices change.",
    search_query: "price",
    status: "done",
    verdict: "current",
    freshness_score: 90,
    label: "fresh",
    current_value: null,
    explanation: "Matches the sources.",
    confidence: 0.9,
    score_breakdown: { verdict: "current", confidence: 0.9, recency: 0.9, agreement: 0.9, quality: 0.9 },
    evidence: [],
    cached: false,
    error: null,
  };
}

const finished: Check = {
  id: ID,
  created_at: new Date().toISOString(),
  status: "done",
  mode: "mock",
  question: null,
  answer: ANSWER,
  corrected_answer: null,
  overall_score: 90,
  summary: { fresh: 3, review: 0, stale: 0, unverified: 0, skipped: 0 },
  claims: TEXTS.map((t, i) => claim(i, t)),
  model_calls: [],
  usage: { llm_calls: 0, prompt_tokens: 0, completion_tokens: 0, search_calls: 0, cache_hits: 0, duration_ms: 1200 },
  error: null,
};

test("highlights stay on their claims after emoji, including multi-code-point ones", async ({ page }) => {
  await page.addInitScript((id) => window.localStorage.setItem("staleguard.history", JSON.stringify([id])), ID);
  await page.route(`**/api/checks/${ID}`, (route) => route.fulfill({ json: finished }));

  const checker = new CheckerPage(page);
  await checker.goto();
  await checker.historyRows.first().click();
  await checker.finished();

  await expect(checker.spans).toHaveCount(TEXTS.length);
  for (const [i, text] of TEXTS.entries()) {
    expect(await checker.spans.nth(i).evaluate((el) => el.textContent), `highlight ${i + 1}`).toBe(text);
  }
  // Nothing was lost or duplicated between the highlights.
  expect(await page.locator(".answer-text").first().evaluate((el) => el.textContent)).toBe(ANSWER);
});
