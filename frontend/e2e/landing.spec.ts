import { expect, test } from "./fixtures";
import { LandingPage } from "./pages/LandingPage";

test.describe("landing page", () => {
  let landing: LandingPage;

  test.beforeEach(async ({ page }) => {
    landing = new LandingPage(page);
    await landing.goto();
  });

  test("nav, hero and mode badge", async ({ page }) => {
    await expect(page).toHaveTitle(/StaleGuard/);
    await expect(landing.nav.getByRole("link", { name: "StaleGuard" })).toBeVisible();
    for (const name of ["Checker", "How it works", "API", "GitHub"]) {
      await expect(landing.nav.getByRole("link", { name, exact: true })).toBeVisible();
    }
    await expect(landing.modeBadge).toHaveText("Mock data");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Catch stale facts in AI answers");
    await expect(landing.hero.getByRole("link", { name: "Check an answer" })).toHaveAttribute("href", "#checker");
    await expect(landing.hero.getByRole("link", { name: "Read the API" })).toHaveAttribute("href", "#api");
  });

  test("copy button puts docker compose up on the clipboard", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await expect(landing.hero.locator(".terminal code")).toContainText("docker compose up");
    await landing.copyButton.click();
    await expect(landing.copyNote).toHaveText("Copied to the clipboard.");
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("docker compose up");
    await expect(landing.copyNote).toHaveText("", { timeout: 5000 }); // the note clears itself
  });

  test("stats", async () => {
    await expect(landing.stats.locator("dt")).toHaveText([
      "PS06 requirements covered",
      "freshness score per claim",
      "backend tests",
    ]);
    await expect(landing.stats.locator("dd")).toHaveText(["4", "0–100", "84"]);
  });

  test("features, how it works, integrations and footer", async () => {
    await expect(landing.features.locator("li.feature")).toHaveCount(6);
    await expect(landing.features.getByRole("heading", { level: 3 })).toHaveText([
      "Claim extraction",
      "Freshness detection",
      "Live verification (Tavily)",
      "Deterministic scoring",
      "Ask mode",
      "Corrected answer",
    ]);

    await expect(landing.howSection.locator(".steps li")).toHaveCount(4);
    await expect(landing.codeWindow.locator("figcaption")).toContainText("check.sh");
    await expect(landing.codeWindow).toContainText("curl -s -X POST");
    await expect(landing.codeWindow).toContainText("/api/checks?wait=true");
    await expect(landing.codeWindow).toContainText('"label": "stale"');

    await expect(landing.integrations.locator(".stack-tile")).toHaveCount(8);
    for (const name of ["Tavily", "Bifrost", "Groq", "gpt-oss", "FastAPI", "React", "SQLite", "Docker"]) {
      await expect(landing.integrations.locator(".stack-name", { hasText: new RegExp(`^${name}$`) })).toBeVisible();
    }

    await expect(landing.footer).toContainText("Freshness check for AI answers.");
    await expect(landing.footer.getByRole("link", { name: "GitHub" })).toHaveAttribute("href", /github\.com/);
    await expect(landing.footer.getByRole("link", { name: "License" })).toHaveAttribute("href", /LICENSE$/);
    await expect(landing.footer).toContainText("PS06 Tavily + Bifrost");
  });

  test("nav links scroll to their sections", async ({ page }) => {
    await landing.nav.getByRole("link", { name: "How it works" }).click();
    await expect(page).toHaveURL(/#how$/);
    await expect(page.getByRole("heading", { name: /From answer/ })).toBeInViewport();

    await landing.nav.getByRole("link", { name: "API", exact: true }).click();
    await expect(page).toHaveURL(/#api$/);
    await expect(landing.codeWindow).toBeInViewport();

    await landing.nav.getByRole("link", { name: "Checker", exact: true }).click();
    await expect(page).toHaveURL(/#checker$/);
    await expect(page.getByRole("heading", { name: /Run a freshness check/ })).toBeInViewport();

    // The logo returns to the top.
    await landing.nav.getByRole("link", { name: "StaleGuard" }).click();
    await expect(page).toHaveURL(/#top$/);
    await expect(page.getByRole("heading", { level: 1 })).toBeInViewport();
  });
});
