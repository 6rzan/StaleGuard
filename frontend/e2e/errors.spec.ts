import { expect, test } from "./fixtures";
import { CheckerPage } from "./pages/CheckerPage";
import { LandingPage } from "./pages/LandingPage";

test.describe("validation", () => {
  test("an empty or blank answer keeps the button disabled", async ({ page }) => {
    const checker = new CheckerPage(page);
    await checker.goto();
    await expect(checker.submit).toBeDisabled();
    await checker.answerInput.fill("   \n  ");
    await expect(checker.submit).toBeDisabled();
    await checker.answerInput.fill("The Pro plan costs $20 per month per user.");
    await expect(checker.submit).toBeEnabled();
    await checker.answerInput.fill("");
    await expect(checker.submit).toBeDisabled();

    await checker.mode("Ask a model").click();
    await expect(checker.submit).toBeDisabled();
    await checker.questionInput.fill("What does the Pro plan cost?");
    await expect(checker.submit).toBeEnabled();
  });

  test("a paste of 8001 characters is capped at 8000 and the counter says so", async ({ page }) => {
    const checker = new CheckerPage(page);
    await checker.goto();
    await checker.answerInput.focus();
    // insertText goes through the editing pipeline like a real paste, so maxlength applies.
    await page.keyboard.insertText("a".repeat(8001));
    expect(await checker.answerInput.evaluate((el: HTMLTextAreaElement) => el.value.length)).toBe(8000);
    await expect(checker.counter).toHaveText("8,000 / 8,000");
    await expect(checker.submit).toBeEnabled();
  });

  test("the API itself rejects 8001 characters and an empty body", async ({ request }) => {
    const tooLong = await request.post("/api/checks", { data: { answer: "a".repeat(8001) } });
    expect(tooLong.status()).toBe(422);
    const empty = await request.post("/api/checks", { data: {} });
    expect(empty.status()).toBe(422);
  });
});

// The browser logs a console error for every failed request; those are the point of this block.
test.describe("API errors", () => {
  test.use({ ignoreConsole: [/Failed to load resource/] });

  test("API unreachable: error notice with Retry, then recovery", async ({ page }) => {
    // History only calls the API for ids this browser remembers.
    await page.addInitScript(() => window.localStorage.setItem("staleguard.history", JSON.stringify(["deadbeef0000"])));
    await page.route("**/api/**", (route) => route.abort("connectionrefused"));
    const landing = new LandingPage(page);
    const checker = new CheckerPage(page);
    await page.goto("/");

    await expect(checker.notice).toContainText("Cannot reach the StaleGuard API");
    await expect(landing.modeBadge).toHaveText("Offline");
    await expect(checker.history).toContainText("History is unavailable right now.");
    const retry = checker.notice.getByRole("button", { name: "Retry" });
    await expect(retry).toBeVisible();

    await page.unroute("**/api/**");
    await retry.click();
    await expect(checker.notice).toHaveCount(0);
    await expect(landing.modeBadge).toHaveText("Mock data");
    await expect(checker.sample("SaaS pricing")).toBeVisible();
  });

  test("starting a check while the API is down shows a clear message", async ({ page }) => {
    const checker = new CheckerPage(page);
    await checker.goto();
    await page.route("**/api/checks", (route) => (route.request().method() === "POST" ? route.abort() : route.continue()));
    await checker.checkAnswer("The Pro plan costs $20 per month per user.");
    await expect(checker.notice).toContainText("Something went wrong");
    await expect(checker.notice).toContainText("Cannot reach the StaleGuard API.");
    await expect(checker.submit).toBeEnabled();
  });

  test("a failed poll shows Retry and Retry loads the check", async ({ page }) => {
    const checker = new CheckerPage(page);
    await checker.goto();
    let failed = false;
    await page.route(/\/api\/checks\/[0-9a-f]+$/, (route) => {
      if (failed) return route.continue();
      failed = true;
      return route.fulfill({ status: 500, json: { detail: "Database is busy" } });
    });
    await checker.checkAnswer("The Pro plan costs $20 per month per user.");
    await expect(checker.notice).toContainText("Database is busy");
    await checker.notice.getByRole("button", { name: "Retry" }).click();
    await checker.finished();
    await expect(checker.notice).toHaveCount(0);
  });

  test("an unknown check id reports Check not found", async ({ request }) => {
    const res = await request.get("/api/checks/doesnotexist");
    expect(res.status()).toBe(404);
  });
});
