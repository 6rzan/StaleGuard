import { expect, test as base } from "@playwright/test";

type Options = {
  // Console messages matching one of these are allowed (for specs that break the network on purpose).
  ignoreConsole: RegExp[];
};

// Every spec fails if the app logs a console error or warning, or throws.
export const test = base.extend<Options>({
  ignoreConsole: [[], { option: true }],
  page: async ({ page, ignoreConsole }, run) => {
    const problems: string[] = [];
    page.on("console", (m) => {
      if ((m.type() === "error" || m.type() === "warning") && !ignoreConsole.some((re) => re.test(m.text()))) {
        problems.push(`console.${m.type()}: ${m.text()}`);
      }
    });
    page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
    await run(page);
    expect(problems, "console errors or warnings from the app").toEqual([]);
  },
});

export { expect };
