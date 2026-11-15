// Regenerates every file in docs/media/ (demo GIF, screenshots, social preview).
//
// Needs: the built app served on http://127.0.0.1:8000 in mock mode (set MOCK_MODE=true, it beats .env) with an EMPTY
// database (the claim cache would otherwise change what the report shows), Playwright
// installed outside this repo, and uv (the GIF is assembled with Pillow via `uv run --with`).
//
//   cd frontend && npm run build
//   cd backend && DATABASE_PATH=/tmp/media.db MOCK_MODE=true uv run uvicorn app.main:app --port 8000
//   npm install --prefix /tmp/pw playwright && npx --prefix /tmp/pw playwright install chromium
//   PW_DIR=/tmp/pw node scripts/record-demo.mjs
//
// --live: records only demo.gif with real data. Start the backend WITHOUT MOCK_MODE (keys come from the
// repo's own .env), with the Bifrost gateway up, a fresh DATABASE_PATH, and wait 70 s between attempts
// (Groq free-tier rate limit):  PW_DIR=/tmp/pw node scripts/record-demo.mjs --live
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

const LIVE = process.argv.includes("--live");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const VIEWPORT = { width: 1280, height: 800 };
const still = (name) => path.join(media, name);

// Python run by uv: merge identical neighbouring frames, scale to 960 px, adaptive palette.
const ASSEMBLE = `
import sys, glob, os
from PIL import Image, ImageChops
src, out = sys.argv[1], sys.argv[2]
live = len(sys.argv) > 3  # live: merge near-identical frames (spinners) and cap each hold at 1 s
files = sorted(glob.glob(os.path.join(src, "*.jpg")))
stamps = [int(os.path.basename(f)[:-4]) for f in files]
imgs, durs = [], []
for i, f in enumerate(files):
    im = Image.open(f).convert("RGB")
    im = im.resize((960, round(im.height * 960 / im.width)), Image.LANCZOS)
    d = (stamps[i + 1] - stamps[i]) if i + 1 < len(files) else 1000
    same = imgs and (sum(ImageChops.difference(imgs[-1], im).convert('L').histogram()[16:]) < (600 if live else 1)) 
    if same:
        durs[-1] += d
    else:
        imgs.append(im); durs.append(d)
if live:
    durs = [min(d, 1000) for d in durs]
pal = [im.quantize(colors=128, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE) for im in imgs]
pal[0].save(out, save_all=True, append_images=pal[1:], duration=durs, loop=0, optimize=True, disposal=1)
print(len(files), "frames captured,", len(imgs), "kept,", sum(durs) / 1000, "seconds")
`;

// The sticky nav covers the top 64 px, so "start" leaves 80 px and "center" never goes above that.
async function smoothScrollTo(page, selector, block = "center") {
  await page.evaluate(
    ([sel, b]) => {
      const r = document.querySelector(sel).getBoundingClientRect();
      const lift = b === "start" ? 80 : Math.max(80, (innerHeight - r.height) / 2);
      scrollTo({ top: scrollY + r.top - lift, behavior: "smooth" });
    },
    [selector, block],
  );
  await sleep(1100);
}

// The nav is slightly see-through; stills make it opaque so text scrolling under it does not ghost through.
const OPAQUE_NAV = ".site-nav { background: #0d0d0d !important; backdrop-filter: none !important; }";
async function newStillPage(browser, options) {
  const context = await browser.newContext({ reducedMotion: "reduce", ...options });
  const page = await context.newPage();
  await page.addInitScript((css) => addEventListener("DOMContentLoaded", () => {
    document.head.insertAdjacentHTML("beforeend", `<style>${css}</style>`);
  }), OPAQUE_NAV);
  return { context, page };
}
// 85 % view: a 1506x941 layout viewport captured at scale 0.85 gives a 1280x800 image.
const SCALED = { viewport: { width: 1506, height: 941 }, deviceScaleFactor: 0.85 };

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

  await sleep(1500);
  await smoothScrollTo(page, "#checker", "start");
  await sleep(500);
  await page.getByRole("button", { name: "SaaS pricing" }).click();
  await sleep(1100);
  await page.getByRole("button", { name: "Check freshness" }).click();
  await page.getByText(/^Finished in/).waitFor({ timeout: 60000 });
  await sleep(600);
  await smoothScrollTo(page, ".claim-card:has(.now)");
  await sleep(900);
  await smoothScrollTo(page, ".corrected");
  await sleep(700);
  await page.getByRole("button", { name: "Show what changed" }).click();
  await sleep(1400);

  capturing = false;
  await loop;

  await context.close();
}

// Live story: a real check against Groq via Bifrost and Tavily (the backend must run without MOCK_MODE).
const LIVE_ANSWER =
  "Python 3.12 is the latest stable version of Python. The current long-term support release of Node.js is version 20.";

async function recordLiveDemo(browser) {
  const context = await browser.newContext({ viewport: VIEWPORT, reducedMotion: "no-preference" });
  const page = await context.newPage();
  await page.goto(base);
  await page.getByText("Live: Bifrost + Tavily").first().waitFor();

  let capturing = true;
  const loop = (async () => {
    while (capturing) {
      const t = Date.now();
      try {
        await page.screenshot({ path: path.join(frames, `${String(t).padStart(14, "0")}.jpg`), type: "jpeg", quality: 92 });
      } catch {
        return;
      }
      await sleep(Math.max(0, 100 - (Date.now() - t)));
    }
  })();

  await sleep(1500);
  await smoothScrollTo(page, "#checker", "start");
  await sleep(400);
  await page.locator("#answer").click();
  await page.locator("#answer").pressSequentially(LIVE_ANSWER, { delay: 14 });
  await sleep(500);
  await page.getByRole("button", { name: "Check freshness" }).click();
  await page.getByText(/^Finished in/).waitFor({ timeout: 120000 });
  const failed = await page.locator(".claim-error").count();
  if (failed > 0) {
    capturing = false;
    await loop;
    await context.close();
    throw new Error("a claim ended in an error (rate limit?); wait 70 s and retry");
  }
  await sleep(800);
  await smoothScrollTo(page, ".claim-card:has(.now)");
  await sleep(2200);
  await smoothScrollTo(page, ".usage");
  await sleep(1500);
  await smoothScrollTo(page, ".corrected");
  await sleep(600);
  await page.getByRole("button", { name: "Show what changed" }).click();
  await sleep(1500);

  capturing = false;
  await loop;
  await context.close();
}

async function stillReport(browser) {
  const { context, page } = await newStillPage(browser, { viewport: VIEWPORT });
  await page.goto(base);
  await openFirstHistory(page, /Northwind/);
  await smoothScrollTo(page, ".result", "start");
  await page.screenshot({ path: still("screenshot-report.png") });
  await context.close();
}

async function stillClaim(browser) {
  const { context, page } = await newStillPage(browser, SCALED);
  await page.goto(base);
  await openFirstHistory(page, /Northwind/);
  await page.locator(".claim-card:has(.now) details.breakdown summary").click();
  await smoothScrollTo(page, ".claim-card:has(.now) .verdict", "start");
  await page.screenshot({ path: still("screenshot-claim.png") });
  await context.close();
}

// Opens a past check from the history list: the same report, no new run (so no "cached" tags).
async function openFirstHistory(page, text) {
  await page.locator(".history button, .history a").filter({ hasText: text }).first().click();
  await page.getByText(/^Finished in/).waitFor();
  await sleep(800);
}

async function stillAsk(browser) {
  const { context, page } = await newStillPage(browser, SCALED);
  await page.goto(base + "/#checker");
  await page.getByRole("button", { name: "Ask a model" }).click();
  await page.getByRole("button", { name: "API versions" }).click();
  await page.getByRole("button", { name: "Ask and check" }).click();
  await page.getByText(/^Finished in/).waitFor({ timeout: 60000 });
  await page.getByRole("button", { name: "Show what changed" }).click();
  await sleep(600);
  // The report starts with the question the model was asked, which marks this as ask mode.
  await smoothScrollTo(page, ".result", "start");
  await page.screenshot({ path: still("screenshot-ask.png") });
  await context.close();
}

async function stillMobile(browser) {
  const { context, page } = await newStillPage(browser, {
    viewport: { width: 375, height: 812 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  await page.goto(base);
  await openFirstHistory(page, /Northwind/);
  await smoothScrollTo(page, ".result", "start");
  await page.screenshot({ path: still("screenshot-mobile.png") });
  await context.close();
}

// docs/media/social-preview.html is hand-written; it loads Google Fonts, so this needs network.
async function socialPreview(browser) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 640 } });
  await page.goto("file:///" + path.join(media, "social-preview.html").replaceAll("\\", "/"));
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: still("social-preview.png") });
  await page.close();
}

async function stillLanding(browser) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
  const page = await context.newPage();
  await page.goto(base);
  await page.evaluate(() => document.fonts.ready);
  await sleep(600);
  await page.screenshot({ path: still("screenshot-landing.png") });
  await context.close();
}

const browser = await chromium.launch();
try {
  if (LIVE) {
    await recordLiveDemo(browser);
  } else {
    await recordDemo(browser);
    await stillReport(browser);
    await stillClaim(browser);
    await stillAsk(browser);
    await stillMobile(browser);
    await stillLanding(browser);
    await socialPreview(browser);
  }
} finally {
  await browser.close();
}

const run = spawnSync(
  "uv",
  ["run", "--no-project", "--with", "pillow", "python", "-c", ASSEMBLE, frames, still("demo.gif"), ...(LIVE ? ["live"] : [])],
  { stdio: "inherit" },
);
fs.rmSync(frames, { recursive: true, force: true });
if (run.status !== 0) process.exit(run.status ?? 1);
