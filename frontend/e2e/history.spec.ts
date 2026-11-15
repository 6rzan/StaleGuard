import { samples, token } from "./api";
import { expect, test } from "./fixtures";
import { CheckerPage } from "./pages/CheckerPage";

test("finished checks appear in the history and reopening one loads it", async ({ page, request }) => {
  const [pricing, versions] = (await samples(request)).filter((s) => s.id === "pricing" || s.id === "api-versions");
  // A unique first sentence keeps the two answers apart from each other and from other tests' checks.
  const first = `Marker ${token()}. ${pricing.answer}`;
  const second = `Marker ${token()}. ${versions.answer}`;
  const row = (answer: string) => page.locator(".history-row", { hasText: answer.slice(0, 20) });

  const checker = new CheckerPage(page);
  await checker.goto();
  await expect(checker.history.getByRole("heading", { name: "History" })).toBeVisible();
  await expect(checker.history).toContainText("Past checks will appear here.");

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
  // Newest first.
  await expect(checker.historyRows).toHaveCount(2);
  await expect(checker.historyRows.first()).toContainText(second.slice(0, 20));

  // Reopen the first one: its answer, claims and score come back.
  await row(first).click();
  await expect(checker.page.locator(".answer-text").first()).toContainText("Northwind Cloud offers three plans");
  await expect(row(first)).toHaveAttribute("aria-current", "true");
  await expect(checker.cards.nth(2).locator(".now")).toContainText("$25 per user per month");
  await expect(checker.statusLine).toContainText("Finished in");

  // And it survives a reload of the page.
  await page.waitForLoadState("networkidle");
  await page.reload();
  await expect(row(first)).toBeVisible();
  await expect(row(second)).toBeVisible();
});

test("a second browser does not see the first browser's checks", async ({ page, browser }) => {
  const mine = `Marker ${token()}. The Pro plan costs $20 per month per user.`;
  const checker = new CheckerPage(page);
  await checker.goto();
  await checker.checkAnswer(mine);
  await checker.finished();
  await expect(checker.historyRows).toHaveCount(1);

  const other = await browser.newContext({ baseURL: test.info().project.use.baseURL });
  try {
    const otherPage = await other.newPage();
    const otherChecker = new CheckerPage(otherPage);
    await otherChecker.goto();
    await expect(otherChecker.history).toContainText("Past checks will appear here.");
    await expect(otherChecker.historyRows).toHaveCount(0);
  } finally {
    await other.close();
  }
});

// The browser logs a console error for the 404 on purpose.
test.describe("stale ids", () => {
  test.use({ ignoreConsole: [/Failed to load resource/] });

  test("ids the server no longer knows are dropped quietly", async ({ page }) => {
    await page.addInitScript(() => window.localStorage.setItem("staleguard.history", JSON.stringify(["deadbeef0000"])));
    const checker = new CheckerPage(page);
    await checker.goto();
    await expect(checker.history).toContainText("Past checks will appear here.");
    expect(await page.evaluate(() => window.localStorage.getItem("staleguard.history"))).toBe("[]");
  });
});
