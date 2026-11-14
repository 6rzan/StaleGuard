// Regenerates every file in docs/media/ (demo GIF, screenshots, social preview).
//
// Needs: the built app served on http://127.0.0.1:8000 in mock mode with an EMPTY
// database (the claim cache would otherwise change what the report shows), Playwright
// installed outside this repo, and uv (the GIF is assembled with Pillow via `uv run --with`).
//
//   cd frontend && npm run build
//   cd backend && DATABASE_PATH=/tmp/media.db MOCK_MODE=true uv run uvicorn app.main:app --port 8000
//   npm install --prefix /tmp/pw playwright && npx --prefix /tmp/pw playwright install chromium
//   PW_DIR=/tmp/pw node scripts/record-demo.mjs
//
// Optional: BASE_URL (default http://127.0.0.1:8000). Frames go to a temp folder, not the repo.

import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const media = path.join(root, "docs", "media");
const base = process.env.BASE_URL ?? "http://127.0.0.1:8000";
const require = createRequire(path.join(path.resolve(process.env.PW_DIR ?? root), "noop.js"));
const { chromium } = require("playwright");

const frames = path.join(os.tmpdir(), "staleguard-frames");
fs.rmSync(frames, { recursive: true, force: true });
fs.mkdirSync(frames, { recursive: true });
fs.mkdirSync(media, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const VIEWPORT = { width: 1280, height: 800 };
const still = (name) => path.join(media, name);

// Python run by uv: merge identical neighbouring frames, scale to 960 px, adaptive palette.
const ASSEMBLE = `
import sys, glob, os
from PIL import Image, ImageChops
src, out = sys.argv[1], sys.argv[2]
files = sorted(glob.glob(os.path.join(src, "*.jpg")))
stamps = [int(os.path.basename(f)[:-4]) for f in files]
imgs, durs = [], []
for i, f in enumerate(files):
    im = Image.open(f).convert("RGB")
    im = im.resize((960, round(im.height * 960 / im.width)), Image.LANCZOS)
    d = (stamps[i + 1] - stamps[i]) if i + 1 < len(files) else 1500
    if imgs and ImageChops.difference(imgs[-1], im).getbbox() is None:
        durs[-1] += d
    else:
        imgs.append(im); durs.append(d)
pal = [im.quantize(colors=128, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE) for im in imgs]
pal[0].save(out, save_all=True, append_images=pal[1:], duration=durs, loop=0, optimize=True, disposal=1)
print(len(files), "frames captured,", len(imgs), "kept,", sum(durs) / 1000, "seconds")
`;

async function smoothScrollTo(page, selector, block = "center") {
  await page.evaluate(
    ([sel, b]) => document.querySelector(sel).scrollIntoView({ behavior: "smooth", block: b }),
    [selector, block],
  );
  await sleep(1400);
}

async function recordDemo(browser) {
  const context = await browser.newContext({ viewport: VIEWPORT, reducedMotion: "no-preference" });
  const page = await context.newPage();
  await page.goto(base);
  await page.getByRole("button", { name: "SaaS pricing" }).waitFor();

  let capturing = true;
  const loop = (async () => {
    while (capturing) {
      const t = Date.now();
      try {
        await page.screenshot({ path: path.join(frames, `${String(t).padStart(14, "0")}.jpg`), type: "jpeg", quality: 92 });
      } catch {
        return;
      }
      await sleep(Math.max(0, 80 - (Date.now() - t)));
    }
  })();

  await sleep(1200);
  await page.getByRole("button", { name: "SaaS pricing" }).click();
  await sleep(1100);
  await page.getByRole("button", { name: "Check freshness" }).click();
  await page.getByText(/^Finished in/).waitFor({ timeout: 60000 });
  await sleep(900);
  await smoothScrollTo(page, ".claim-card:has(.now)");
  await sleep(1300);
  await smoothScrollTo(page, ".corrected");
  await sleep(1500);

  capturing = false;
  await loop;

  // Stills come from the same finished check, so the claims are not marked "cached".
  await smoothScrollTo(page, ".result", "start");
  await page.screenshot({ path: still("screenshot-report.png") });

  const card = page.locator(".claim-card:has(.now)").first();
  await card.locator("details.breakdown summary").click();
  // The open card is taller than the viewport; shrink the page a little so it fits.
  await page.evaluate(() => (document.documentElement.style.zoom = "0.74"));
  await smoothScrollTo(page, ".claim-card:has(.now)", "center");
  await page.screenshot({ path: still("screenshot-claim.png") });
  await context.close();
}

async function stillAsk(browser) {
  const context = await browser.newContext({ viewport: VIEWPORT, reducedMotion: "reduce" });
  const page = await context.newPage();
  await page.goto(base);
  await page.getByRole("button", { name: "Ask a model" }).click();
  await page.getByRole("button", { name: "API versions" }).click();
  await page.getByRole("button", { name: "Ask and check" }).click();
  await page.getByText(/^Finished in/).waitFor({ timeout: 60000 });
  await page.getByRole("button", { name: "Show what changed" }).click();
  await sleep(600);
  // Zoomed out so the mode switch, the answer and the corrected answer share one screen.
  await page.evaluate(() => (document.documentElement.style.zoom = "0.62"));
  await smoothScrollTo(page, "#main", "start");
  await page.screenshot({ path: still("screenshot-ask.png") });
  await context.close();
}

async function stillMobile(browser) {
  const context = await browser.newContext({
    viewport: { width: 375, height: 812 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  await page.goto(base);
  // Open the pricing check from history: same report, no new run.
  await page.locator(".history button, .history a").filter({ hasText: /Northwind/ }).first().click();
  await page.getByText(/^Finished in/).waitFor();
  await sleep(800);
  await page.evaluate(() => document.querySelector(".result").scrollIntoView({ block: "start" }));
  await sleep(500);
  await page.screenshot({ path: still("screenshot-mobile.png") });
  await context.close();
}

async function socialPreview(browser) {
  const html = fs
    .readFileSync(path.join(os.homedir(), ".claude/skills/repo-launch-checklist/assets/social-preview.html"), "utf8")
    .replace("--bg: #0b0d12; --fg: #f4f5f7; --muted: #9aa3b2; --accent: #7c5cff;", "--bg: #f6f3ec; --fg: #1d1b16; --muted: #4a463d; --accent: #0f4c5c;")
    .replace("#151925", "#fffdf8")
    .replaceAll("#262c3d", "#ddd6c6")
    .replace("background: #11141c", "background: #fffdf8")
    .replace("{{EYEBROW, e.g. open source · MIT}}", "Tavily + Bifrost")
    .replace("{{PROJECT NAME}}", "StaleGuard")
    .replace(
      "{{ONE-LINE DESCRIPTION}}",
      "Catch outdated facts in LLM answers: re-check each claim against the live web and score its freshness.",
    )
    .replace("{{INSTALL COMMAND}}", "docker compose up")
    .replace("{{SCREENSHOT PATH OR DATA URI}}", "screenshot-report.png")
    .replace("max-width: 34ch", "max-width: 30ch")
    .replace("font-size: 32px; line-height: 1.3", "font-size: 30px; line-height: 1.3")
    .replace("object-fit: cover", "object-fit: cover; object-position: top left");
  const file = path.join(media, "social-preview.html");
  fs.writeFileSync(file, html);
  const page = await browser.newPage({ viewport: { width: 1280, height: 640 } });
  await page.goto("file:///" + file.replaceAll("\\", "/"));
  await page.screenshot({ path: still("social-preview.png") });
  await page.close();
}

const browser = await chromium.launch();
try {
  await recordDemo(browser);
  await stillAsk(browser);
  await stillMobile(browser);
  await socialPreview(browser);
} finally {
  await browser.close();
}

const run = spawnSync(
  "uv",
  ["run", "--no-project", "--with", "pillow", "python", "-c", ASSEMBLE, frames, still("demo.gif")],
  { stdio: "inherit" },
);
fs.rmSync(frames, { recursive: true, force: true });
if (run.status !== 0) process.exit(run.status ?? 1);
