import { expect, test } from "./fixtures";
import { CheckerPage } from "./pages/CheckerPage";

test("ask mode: generating, answer with question, claims, corrected answer and diff", async ({ page }) => {
  const question = "How much do Northwind Cloud's plans cost?";

  // Poll 1 is rewritten to the generating state (no answer yet); later polls are real.
  let polls = 0;
  await page.route(/\/api\/checks\/[0-9a-f]+$/, async (route) => {
    const response = await route.fetch();
    polls += 1;
    if (polls > 1) return route.fulfill({ response });
    const real = (await response.json()) as object;
    await route.fulfill({
      response,
      json: { ...real, status: "generating", answer: "", claims: [], overall_score: null, corrected_answer: null },
    });
  });

  const checker = new CheckerPage(page);
  await checker.goto();
  await checker.mode("Ask a model").click();
  await expect(checker.mode("Ask a model")).toHaveAttribute("aria-pressed", "true");
  await expect(checker.submit).toBeDisabled();

  await checker.sample("SaaS pricing").click();
  await expect(checker.questionInput).toHaveValue(question);
  await checker.submit.click();

  await expect(page.getByText("Generating an answer through the gateway…").first()).toBeVisible();
  await expect(page.locator(".question")).toHaveText(`Question ${question}`);
  await expect(checker.spans).toHaveCount(0);

  await checker.finished();
  await expect(page.locator(".question")).toHaveText(`Question ${question}`);
  await expect(page.locator(".answer-text").first()).toContainText("Northwind Cloud offers three plans");
  await expect(checker.spans.first()).toBeVisible();
  await expect(checker.cards).toHaveCount(5);
  await expect(checker.cards.nth(1).locator(".now")).toContainText("$25 per user per month");

  const corrected = page.getByRole("region", { name: "Corrected answer" });
  await expect(corrected).toContainText("$25");
  await expect(corrected.locator("del, ins")).toHaveCount(0);

  await corrected.getByRole("button", { name: "Show what changed" }).click();
  await expect(corrected.getByRole("button", { name: "Hide what changed" })).toHaveAttribute("aria-pressed", "true");
  await expect(corrected.locator("del")).toContainText("$20");
  await expect(corrected.locator("ins")).toContainText("$25");
  await expect(corrected.locator(".diff-key")).toBeVisible();

  await corrected.getByRole("button", { name: "Hide what changed" }).click();
  await expect(corrected.locator("del, ins")).toHaveCount(0);
});
