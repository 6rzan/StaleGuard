import { samples, token } from "./api";
import { expect, test } from "./fixtures";
import { CheckerPage } from "./pages/CheckerPage";

test("finished checks appear in the history and reopening one loads it", async ({ page, request }) => {
  const [pricing, versions] = (await samples(request)).filter((s) => s.id === "pricing" || s.id === "api-versions");
  // A unique first sentence makes each history row findable among other tests' checks.
  const first = `Marker ${token()}. ${pricing.answer}`;
  const second = `Marker ${token()}. ${versions.answer}`;
  const row = (answer: string) => page.locator(".history-row", { hasText: answer.slice(0, 20) });

  const checker = new CheckerPage(page);
  await checker.goto();
  await expect(checker.history.getByRole("heading", { name: "History" })).toBeVisible();

  await checker.checkAnswer(first);
  await checker.finished();
  await expect(row(first)).toBeVisible();
  await expect(row(first)).toHaveAttribute("aria-current", "true");
  await expect(row(first).locator(".score-chip")).toHaveText(/^\d+$/);
  await expect(row(first)).toContainText("mock");

  await checker.checkAnswer(second);
  await checker.finished();
  await expect(row(second)).toHaveAttribute("aria-current", "true");
  await expect(row(first)).not.toHaveAttribute("aria-current", "true");
  await expect(checker.page.locator(".answer-text").first()).toContainText("Lumen API");

  // Reopen the first one: its answer, claims and score come back.
  await row(first).click();
  await expect(checker.page.locator(".answer-text").first()).toContainText("Northwind Cloud offers three plans");
  await expect(row(first)).toHaveAttribute("aria-current", "true");
  await expect(checker.cards.nth(2).locator(".now")).toContainText("$25 per user per month");
  await expect(checker.statusLine).toContainText("Finished in");

  // And it survives a reload of the page.
  await page.reload();
  await expect(row(first)).toBeVisible();
  await expect(row(second)).toBeVisible();
});
