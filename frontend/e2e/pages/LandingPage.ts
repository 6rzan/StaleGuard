import type { Locator, Page } from "@playwright/test";

export class LandingPage {
  readonly nav: Locator;
  readonly modeBadge: Locator;
  readonly hero: Locator;
  readonly copyButton: Locator;
  readonly copyNote: Locator;
  readonly stats: Locator;
  readonly features: Locator;
  readonly howSection: Locator;
  readonly codeWindow: Locator;
  readonly integrations: Locator;
  readonly footer: Locator;

  constructor(readonly page: Page) {
    this.nav = page.getByRole("navigation", { name: "Main" });
    this.modeBadge = page.locator(".mode-badge");
    this.hero = page.getByRole("region", { name: /Catch stale facts/ });
    this.copyButton = page.getByRole("button", { name: "Copy the command" });
    this.copyNote = page.locator(".copy-note").first();
    this.stats = page.locator("dl.stats");
    this.features = page.getByRole("region", { name: /Every claim, checked/ });
    this.howSection = page.locator("#how");
    this.codeWindow = page.locator("#api");
    this.integrations = page.getByRole("region", { name: /Built on/ });
    this.footer = page.getByRole("contentinfo");
  }

  async goto() {
    await this.page.goto("/");
    // The badge leaves "Connecting…" once /api/health answered.
    await this.modeBadge.filter({ hasNotText: "Connecting" }).waitFor();
  }
}
