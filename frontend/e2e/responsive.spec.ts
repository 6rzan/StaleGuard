import { samples } from "./api";
import { expect, test } from "./fixtures";
import { CheckerPage } from "./pages/CheckerPage";

const BREAKPOINTS = [
  { name: "phone", width: 375, height: 812 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "desktop", width: 1440, height: 900 },
];

for (const { name, width, height } of BREAKPOINTS) {
  test.describe(`${name} ${width}px`, () => {
    test.use({ viewport: { width, height } });

    test("no horizontal scroll and the checker is usable", async ({ page, request }) => {
      const pricing = (await samples(request)).find((s) => s.id === "pricing");
      if (!pricing) throw new Error("pricing sample missing");
      const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

      const checker = new CheckerPage(page);
      await checker.goto();
      expect(await overflow(), "landing overflows horizontally").toBeLessThanOrEqual(0);
      await page.screenshot({ path: `test-results/screens/${name}-landing.png`, fullPage: true });

      // Use the checker end to end at this width.
      await checker.sample("SaaS pricing").click();
      await expect(checker.answerInput).toHaveValue(pricing.answer);
      await checker.submit.click();
      await checker.finished();
      await expect(checker.summary).toBeInViewport();
      await expect(checker.spans.first()).toBeVisible();
      await checker.spans.nth(1).click();
      await expect(checker.cards.nth(1)).toBeFocused();
      expect(await overflow(), "finished report overflows horizontally").toBeLessThanOrEqual(0);
      await page.screenshot({ path: `test-results/screens/${name}-report.png`, fullPage: true });
    });
  });
}

test.describe("phone tap targets", () => {
  test.use({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true });

  test("buttons and primary links are at least 40 px tall", async ({ page, request }) => {
    const pricing = (await samples(request)).find((s) => s.id === "pricing");
    if (!pricing) throw new Error("pricing sample missing");
    const checker = new CheckerPage(page);
    await checker.goto();
    await checker.answerInput.fill(pricing.answer);
    await checker.submit.click();
    await checker.finished();

    // Every button, plus the call-to-action links; inline text links in the footer are exempt.
    const targets = page.locator("button:visible, a.btn:visible, .nav-end a:visible");
    const small: string[] = [];
    for (const el of await targets.all()) {
      const box = await el.boundingBox();
      if (box && (box.height < 40 || box.width < 40)) {
        small.push(`${(await el.innerText()) || (await el.getAttribute("aria-label")) || "?"} ${Math.round(box.width)}x${Math.round(box.height)}`);
      }
    }
    expect(small, "tap targets under 40 px").toEqual([]);
    expect(await targets.count()).toBeGreaterThan(8);
  });
});
