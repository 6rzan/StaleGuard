import type { Locator, Page } from "@playwright/test";
import { expect } from "@playwright/test";

export class CheckerPage {
  readonly answerInput: Locator;
  readonly questionInput: Locator;
  readonly submit: Locator;
  readonly counter: Locator;
  readonly summary: Locator;
  readonly statusLine: Locator;
  readonly ring: Locator;
  readonly spans: Locator;
  readonly cards: Locator;
  readonly history: Locator;
  readonly historyRows: Locator;
  readonly usage: Locator;
  readonly notice: Locator;

  constructor(readonly page: Page) {
    this.answerInput = page.getByRole("textbox", { name: "Paste an AI-generated answer" });
    this.questionInput = page.getByRole("textbox", { name: "Ask a question" });
    this.submit = page.locator("form button[type=submit]");
    this.counter = page.locator("#answer-count");
    this.summary = page.getByRole("region", { name: /Freshness report/ });
    this.statusLine = page.locator(".status-line");
    this.ring = page.locator(".ring");
    this.spans = page.locator(".claim-span");
    this.cards = page.locator(".claim-card");
    this.history = page.getByRole("complementary", { name: "History" });
    this.historyRows = this.history.locator(".history-row");
    this.usage = page.locator("section.usage");
    this.notice = page.getByRole("alert");
  }

  async goto() {
    await this.page.goto("/");
    // Samples load with the first /api round trip; wait for them so chips are clickable.
    await this.sample("SaaS pricing").waitFor();
  }

  mode(name: "Check an answer" | "Ask a model") {
    return this.page.getByRole("group", { name: "Input mode" }).getByRole("button", { name });
  }

  sample(title: string) {
    return this.page.locator(".chips").getByRole("button", { name: title });
  }

  async checkAnswer(text: string) {
    await this.answerInput.fill(text);
    await this.submit.click();
  }

  async ask(question: string) {
    await this.mode("Ask a model").click();
    await this.questionInput.fill(question);
    await this.submit.click();
  }

  async finished() {
    await expect(this.statusLine).toContainText("Finished in", { timeout: 20_000 });
  }

  // Claims in reading order, as the UI numbers them.
  async cardTexts() {
    return this.cards.locator(".claim-text, .compact-text").allTextContents();
  }

  count(tone: "fresh" | "review" | "stale" | "unverified" | "skipped") {
    return this.summary.locator(`.counts li[data-tone="${tone}"] .count-num`);
  }
}
