import { readFile } from "node:fs/promises";
import { runCheck, samples } from "./api";
import { expect, test } from "./fixtures";
import { CheckerPage } from "./pages/CheckerPage";

test("Download report saves staleguard-report-<id>.md with the score and the claims", async ({ page, request }) => {
  const pricing = (await samples(request)).find((s) => s.id === "pricing");
  if (!pricing) throw new Error("pricing sample missing");
  const api = await runCheck(request, pricing.answer);

  const checker = new CheckerPage(page);
  await checker.goto();
  await expect(checker.summary).toHaveCount(0);

  const created = page.waitForResponse((r) => r.url().endsWith("/api/checks") && r.request().method() === "POST");
  await checker.checkAnswer(pricing.answer);
  const { id } = (await (await created).json()) as { id: string };
  await checker.finished();

  const downloadButton = page.getByRole("button", { name: "Download report" });
  const [download] = await Promise.all([page.waitForEvent("download"), downloadButton.click()]);
  expect(download.suggestedFilename()).toBe(`staleguard-report-${id}.md`);

  const path = await download.path();
  const md = await readFile(path, "utf8");
  expect(md).toContain("# StaleGuard report");
  expect(md).toContain(`- Check: ${id}`);
  expect(md).toContain(`- Overall freshness score: ${api.overall_score} / 100`);
  expect(md).toContain("1 fresh, 0 need review, 1 stale, 1 unverified, 2 skipped");
  expect(md).toContain("## Verified claims");
  for (const claim of api.claims.filter((c) => c.status === "done")) expect(md).toContain(claim.text);
  expect(md).toContain("- Current value: $25 per user per month since September 2026");
  expect(md).toContain("Sources:");
  expect(md).toContain("## Corrected answer");
});

test("the download button only exists once the check has finished", async ({ page }) => {
  const checker = new CheckerPage(page);
  await checker.goto();
  await expect(page.getByRole("button", { name: "Download report" })).toHaveCount(0);
});
