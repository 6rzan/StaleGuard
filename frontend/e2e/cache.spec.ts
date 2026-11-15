import { token } from "./api";
import { expect, test } from "./fixtures";
import { CheckerPage } from "./pages/CheckerPage";

test("the same answer twice: the second run is served from the cache", async ({ page }) => {
  // The token keeps this claim's cache key private to this test, so the first run is always a miss.
  const answer = `The Pro plan costs $20 per month per user, ref ${token()}.`;
  const checker = new CheckerPage(page);
  await checker.goto();

  await checker.checkAnswer(answer);
  await checker.finished();
  await expect(checker.cards).toHaveCount(1);
  await expect(page.getByText("cached", { exact: true })).toHaveCount(0);
  await expect(checker.usage.getByText("Cache hits")).toHaveCount(0);
  await expect(checker.usage.locator(".totals div", { hasText: "Searches" }).locator("dd")).toHaveText("1");

  await checker.checkAnswer(answer);
  await expect(checker.statusLine).toContainText("Finished in");
  await expect(page.locator(".claim-tags .tag", { hasText: /^cached$/ })).toHaveCount(1);
  await expect(checker.usage.locator(".totals div", { hasText: "Cache hits" }).locator("dd")).toHaveText("1");
  await expect(checker.usage.locator(".totals div", { hasText: "Searches" }).locator("dd")).toHaveText("0");
  // A cached verdict still renders in full.
  await expect(checker.cards.first().locator(".now")).toContainText("$25 per user per month");
});
