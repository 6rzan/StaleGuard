import { expect, test } from "./fixtures";
import { CheckerPage } from "./pages/CheckerPage";

// The fixture in ./fixtures already fails any spec on a console error, warning or uncaught exception.
// This spec does the full tour in one page so a late error cannot hide, and adds the network
// and Core Web Vitals smoke checks from the browser-qa skill.
test("a full session: no console problems, no failed requests, healthy vitals", async ({ page }) => {
  const failed: string[] = [];
  page.on("response", (r) => {
    if (r.status() >= 400) failed.push(`${r.status()} ${r.url()}`);
  });
  page.on("requestfailed", (r) => failed.push(`failed ${r.url()}`));
  await page.addInitScript(() => {
    const w = window as unknown as { __vitals: { lcp: number; cls: number } };
    w.__vitals = { lcp: 0, cls: 0 };
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) w.__vitals.lcp = e.startTime;
    }).observe({ type: "largest-contentful-paint", buffered: true });
    new PerformanceObserver((l) => {
      for (const e of l.getEntries() as unknown as { value: number; hadRecentInput: boolean }[]) {
        if (!e.hadRecentInput) w.__vitals.cls += e.value;
      }
    }).observe({ type: "layout-shift", buffered: true });
  });

  const checker = new CheckerPage(page);
  await checker.goto();
  await page.waitForLoadState("networkidle");
  const { lcp, cls } = await page.evaluate(() => (window as unknown as { __vitals: { lcp: number; cls: number } }).__vitals);
  expect(lcp, "LCP ms").toBeLessThan(2500);
  expect(cls, "CLS before interaction").toBeLessThan(0.1);

  await checker.sample("API versions").click();
  await checker.submit.click();
  await checker.finished();
  await page.getByRole("button", { name: "Show what changed" }).click();
  await checker.spans.first().click();

  await checker.mode("Ask a model").click();
  await checker.sample("Leadership and regulation").click();
  await checker.submit.click();
  await checker.finished();
  await checker.historyRows.first().click();
  await checker.finished();
  await page.reload();
  await expect(checker.historyRows.first()).toBeVisible();

  expect(failed, "failed or 4xx/5xx requests").toEqual([]);
});
