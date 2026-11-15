import { expect, test } from "./fixtures";
import { CheckerPage } from "./pages/CheckerPage";

const ANSWER =
  "Python 3.12 is the latest stable version of Python. The current long-term support release of Node.js is version 20.";

// One real check through Bifrost and Tavily. It uses the Groq free tier, so it is opt-in:
//   LIVE_E2E=1 npx playwright test e2e/live.spec.ts
// It needs a live backend (MOCK_MODE=false) on port 8000 serving the built frontend.
test.describe("@live", () => {
  test.skip(!process.env.LIVE_E2E, "set LIVE_E2E=1 to run against the live backend on port 8000");
  test.use({ baseURL: "http://127.0.0.1:8000" });

  test("a real check finishes with verified claims and sources", async ({ page }) => {
    test.setTimeout(120_000);
    const checker = new CheckerPage(page);
    await page.goto("/");
    await expect(page.locator(".mode-badge")).toHaveText("Live: Bifrost + Tavily");

    await checker.checkAnswer(ANSWER);
    await expect(checker.statusLine).toContainText("Finished in", { timeout: 90_000 });

    await expect(checker.cards).toHaveCount(2);
    await expect(checker.page.locator(".claim-error")).toHaveCount(0);
    await expect(checker.page.locator(".tag-state", { hasText: "Error" })).toHaveCount(0);
    await expect(checker.cards.locator(".score-num")).toHaveCount(2); // both scored, so both verified
    await expect(checker.cards.locator(".evidence-item").first()).toBeVisible();
    for (const card of await checker.cards.all()) {
      expect(await card.locator(".evidence-item").count(), "sources per claim").toBeGreaterThan(0);
    }
    await expect(checker.page.getByRole("heading", { name: "Sources, live web via Tavily" })).toHaveCount(2);
  });
});
