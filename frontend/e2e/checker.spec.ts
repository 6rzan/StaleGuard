import { runCheck, samples, type ApiSample } from "./api";
import { expect, test } from "./fixtures";
import { CheckerPage } from "./pages/CheckerPage";

let all: ApiSample[];

test.beforeAll(async ({ request }) => {
  all = await samples(request);
});

test.describe("checker, one run per sample", () => {
  for (const title of ["SaaS pricing", "API versions", "Leadership and regulation"]) {
    test(`${title}: finished report matches the API`, async ({ page, request }) => {
      const sample = all.find((s) => s.title === title);
      if (!sample) throw new Error(`sample ${title} missing from /api/samples`);
      const api = await runCheck(request, sample.answer);
      expect(api.status).toBe("done");

      const checker = new CheckerPage(page);
      await checker.goto();
      await checker.sample(title).click();
      await expect(checker.answerInput).toHaveValue(sample.answer);
      await checker.submit.click();
      await checker.finished();

      // Summary: overall score and the five counts equal what the API returned for the same answer.
      await expect(checker.ring).toHaveAttribute("aria-label", new RegExp(`score ${api.overall_score} out of 100`));
      for (const tone of ["fresh", "review", "stale", "unverified", "skipped"] as const) {
        await expect(checker.count(tone)).toHaveText(String(api.summary[tone]));
      }

      // Claims: same text, same order, same per-claim score.
      const claims = [...api.claims].sort((a, b) => a.start - b.start);
      await expect(checker.cards).toHaveCount(claims.length);
      expect(await checker.cardTexts()).toEqual(claims.map((c) => c.text));
      await expect(checker.spans).toHaveCount(claims.length);
      const scored = claims.filter((c) => c.freshness_score !== null);
      await expect(checker.cards.locator(".score-num")).toHaveText(scored.map((c) => String(c.freshness_score)));
      await expect(page.locator(".claim-card.compact")).toHaveCount(claims.filter((c) => c.status === "skipped").length);

      await expect(checker.usage).toContainText("Models, mock rules");
      await expect(page.locator("h2", { hasText: "Freshness report" }).locator(".pill-mock")).toHaveText("Mock data");
    });
  }
});

test.describe("checker details (pricing sample)", () => {
  let checker: CheckerPage;

  test.beforeEach(async ({ page }) => {
    checker = new CheckerPage(page);
    await checker.goto();
    await checker.sample("SaaS pricing").click();
    await checker.submit.click();
    await checker.finished();
  });

  test("highlighted spans link to their cards by click and by Enter", async ({ page }) => {
    // Span 2 is the stale Pro plan price; span 3 is the fresh Team plan claim.
    await expect(checker.spans.nth(1)).toHaveAttribute("aria-label", /^The Pro plan costs \$20 .* Claim 2, Stale\./);
    await checker.spans.nth(1).click();
    await expect(checker.cards.nth(1)).toBeFocused();
    await expect(checker.cards.nth(1)).toBeInViewport();

    await checker.spans.nth(2).focus();
    await page.keyboard.press("Enter");
    await expect(checker.cards.nth(2)).toBeFocused();
    await expect(checker.cards.nth(2)).toContainText("The Team plan includes 50 GB");

    await checker.spans.nth(1).focus();
    await page.keyboard.press("Space");
    await expect(checker.cards.nth(1)).toBeFocused();
  });

  test("a stale card shows the current value, dated sources and the score breakdown", async () => {
    const stale = checker.cards.filter({ has: checker.page.locator('.score-label[data-tone="stale"]') });
    await expect(stale).toHaveCount(1);
    await expect(stale.locator(".now")).toHaveText("Now: $25 per user per month since September 2026");
    await expect(stale.locator(".verdict-text")).toContainText("Out of date");
    await expect(stale.locator(".score-num")).toHaveText("10");
    await expect(stale.locator("[role=meter]")).toHaveAttribute("aria-valuenow", "10");

    await expect(stale.getByRole("heading", { name: "Sources, mock fixtures" })).toBeVisible();
    const sources = stale.locator(".evidence-item");
    await expect(sources).toHaveCount(3);
    await expect(sources.locator(".evidence-meta").first()).toHaveText(/\S+ · [A-Z][a-z]{2} \d{1,2}, \d{4}$/);
    await expect(sources.first().locator("a")).toHaveAttribute("href", /^https?:\/\//);
    await expect(sources.first().locator(".stance")).toBeVisible();

    const breakdown = stale.locator("details.breakdown");
    await expect(breakdown.locator("dl")).toBeHidden();
    await breakdown.locator("summary").click();
    await expect(breakdown.locator("dt")).toHaveText(["Verdict", "Confidence", "Recency", "Agreement", "Quality"]);
    await expect(breakdown.locator("dd").first()).toContainText("outdated");
    await expect(breakdown.locator(".formula")).toHaveText("score = 35 x (1 - quality)");
  });

  test("a timeless claim is shown compact and marked not checked", async ({ page }) => {
    await expect(page.locator(".claim-card.compact").first()).toContainText("Timeless, not checked");
  });

  test("an unverified claim with no sources says so", async () => {
    const card = checker.cards.nth(3);
    await expect(card).toContainText("Customers who pay annually");
    await expect(card.locator(".verdict-text")).toHaveText("Could not be verified against live sources.");
    await expect(card.locator(".evidence-item")).toHaveCount(0);
  });
});

test.describe("progressive states", () => {
  test("queued, extracting, verifying and finished are each shown", async ({ page, request }) => {
    const sample = (await samples(request)).find((s) => s.id === "pricing");
    if (!sample) throw new Error("pricing sample missing");

    // Poll 1 and 2 are rewritten from the real response so the in-between states are
    // deterministic; from poll 3 on the real, finished data passes through.
    let polls = 0;
    await page.route(/\/api\/checks\/[0-9a-f]+$/, async (route) => {
      const response = await route.fetch();
      const real = (await response.json()) as Record<string, unknown> & { claims: Record<string, unknown>[] };
      polls += 1;
      if (polls === 1) {
        await route.fulfill({ response, json: { ...real, status: "extracting", claims: [], overall_score: null } });
      } else if (polls === 2) {
        let first = true;
        const claims = real.claims.map((c) => {
          if (c.status === "skipped") return c;
          const status = first ? "verifying" : "pending";
          first = false;
          return { ...c, status, label: null, verdict: null, freshness_score: null, evidence: [], score_breakdown: null };
        });
        await route.fulfill({ response, json: { ...real, status: "verifying", claims, overall_score: null } });
      } else {
        await route.fulfill({ response });
      }
    });

    const checker = new CheckerPage(page);
    await checker.goto();
    await checker.checkAnswer(sample.answer);
    await expect(checker.submit).toHaveText("Checking…");
    await expect(checker.submit).toBeDisabled();

    await expect(checker.statusLine).toHaveText("Extracting claims…");
    await expect(checker.ring).toHaveAttribute("aria-label", "Overall score not ready");

    await expect(checker.statusLine).toHaveText("Verifying 1 of 3…");
    await expect(page.locator('.claim-span[data-busy="true"]')).toHaveCount(3);
    await expect(page.locator('.claim-card[data-busy="true"] .skeleton')).toHaveCount(3);

    await checker.finished();
    await expect(page.locator('[data-busy="true"]')).toHaveCount(0);
    await expect(checker.submit).toHaveText("Check freshness");
    await expect(checker.submit).toBeEnabled();
  });
});
