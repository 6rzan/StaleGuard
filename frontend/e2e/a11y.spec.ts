import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { CheckerPage } from "./pages/CheckerPage";

// Animations are skipped so axe measures final colours, not a mid-transition frame.
test.use({ reducedMotion: "reduce" });

async function audit(page: Page) {
  const { violations } = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"])
    .analyze();
  const blocking = violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  const other = violations.filter((v) => !blocking.includes(v)).map((v) => `${v.impact} ${v.id}`);
  if (other.length > 0) console.log(`axe, not blocking: ${other.join(", ")}`);
  return blocking.map((v) => `${v.impact} ${v.id}: ${v.help} (${v.nodes.map((n) => n.target.join(" ")).join(" | ")})`);
}

test("landing page has no serious or critical axe violations", async ({ page }) => {
  const checker = new CheckerPage(page);
  await checker.goto();
  expect(await audit(page)).toEqual([]);
});

test("a finished report has no serious or critical axe violations", async ({ page }) => {
  const checker = new CheckerPage(page);
  await checker.goto();
  await checker.sample("SaaS pricing").click();
  await checker.submit.click();
  await checker.finished();
  await checker.cards.nth(1).locator("details.breakdown summary").click(); // open state is part of the page too
  expect(await audit(page)).toEqual([]);
});

test("a report with a corrected answer and its diff has no serious or critical axe violations", async ({ page }) => {
  const checker = new CheckerPage(page);
  await checker.goto();
  await checker.mode("Ask a model").click();
  await checker.sample("API versions").click();
  await checker.submit.click();
  await checker.finished();
  await page.getByRole("button", { name: "Show what changed" }).click();
  expect(await audit(page)).toEqual([]);
});

test("keyboard: skip link, mode toggle, form and span are reachable", async ({ page }) => {
  const checker = new CheckerPage(page);
  await checker.goto();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to the checker" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/#checker$/);

  await checker.sample("SaaS pricing").focus();
  await page.keyboard.press("Enter");
  await expect(checker.answerInput).toHaveValue(/Northwind Cloud/);
  await checker.submit.focus();
  await page.keyboard.press("Enter");
  await checker.finished();
  await checker.spans.first().focus();
  await expect(checker.spans.first()).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(checker.cards.first()).toBeFocused();
});
