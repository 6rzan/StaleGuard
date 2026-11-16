// Records docs/media/staleguard-screen-recording.mp4: a captioned screen recording of the live app (no audio).
// It is the source footage for the narrated cut in docs/media/staleguard-demo.mp4, which this script does not overwrite.
//
// Needs: the built frontend served by the backend on http://127.0.0.1:8000 in LIVE mode (real keys in
// the repo's .env, Bifrost gateway up on :8080), a fresh DATABASE_PATH so nothing is cached, Playwright
// installed outside this repo, and ffmpeg inside WSL (run as `wsl.exe -u root -e ffmpeg`).
//
//   cd backend && DATABASE_PATH=/tmp/video.db uv run uvicorn app.main:app --port 8000
//   PW_DIR=/tmp/pw node scripts/record-video.mjs               # both segments, 65 s apart, then assemble
//   PW_DIR=/tmp/pw node scripts/record-video.mjs --segment=b   # redo one segment (a, b), then assemble
//   PW_DIR=/tmp/pw node scripts/record-video.mjs --segment=assemble
//
// Segment A is the paste-and-check story, segment B is ask mode plus the end card. They are recorded as
// separate videos so the wait between live checks (Groq free tier) never reaches the final cut.

import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const base = process.env.BASE_URL ?? "http://127.0.0.1:8000";
const require = createRequire(path.join(path.resolve(process.env.PW_DIR ?? root), "noop.js"));
const { chromium } = require("playwright");

const work = path.join(os.tmpdir(), "staleguard-video");
fs.mkdirSync(work, { recursive: true });
const out = path.join(root, "docs", "media", "staleguard-screen-recording.mp4");
const only = (process.argv.find((a) => a.startsWith("--segment=")) ?? "").slice(10);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ANSWER =
  "Python 3.12 is the latest stable version of Python. The current long-term support release of Node.js is version 20.";
const QUESTION = "What is the latest stable version of Python, and which Node.js version is the current LTS?";

const CAPTION_CSS = `position:fixed;left:0;right:0;bottom:0;z-index:2147483647;box-sizing:border-box;
padding:16px 56px;min-height:78px;display:flex;align-items:center;background:rgba(0,0,0,.82);color:#fff;
font:500 22px/1.35 "IBM Plex Sans",system-ui,sans-serif;border-top:1px solid rgba(57,255,20,.5)`;

async function caption(page, text) {
  await page.evaluate(
    ([t, css]) => {
      let el = document.getElementById("demo-caption");
      if (!el) {
        el = document.createElement("div");
        el.id = "demo-caption";
        el.setAttribute("style", css);
        document.body.appendChild(el);
      }
      el.textContent = t;
    },
    [text, CAPTION_CSS],
  );
}

// The sticky nav covers the top 64 px, so leave 80 px above the target.
async function scrollTo(page, selector, lift = 80, wait = 1200) {
  await page.evaluate(
    ([sel, l]) => {
      const r = document.querySelector(sel).getBoundingClientRect();
      scrollTo({ top: scrollY + r.top - l, behavior: "smooth" });
    },
    [selector, lift],
  );
  await sleep(wait);
}

async function finished(page) {
  await page.getByText(/^Finished in/).waitFor({ timeout: 120000 });
  if ((await page.locator(".claim-error").count()) > 0) {
    throw new Error("a claim ended in an error; wait 70 s and redo the segment");
  }
}

async function record(browser, name, story) {
  const dir = path.join(work, name);
  fs.rmSync(dir, { recursive: true, force: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    recordVideo: { dir, size: { width: 1280, height: 720 } },
  });
  const page = await context.newPage();
  const video = page.video();
  try {
    await story(page);
  } finally {
    await context.close();
  }
  await video.saveAs(path.join(work, `${name}.webm`));
}

async function segmentA(page) {
  await page.goto(base);
  await page.getByText("Live: Bifrost + Tavily").first().waitFor();
  await caption(page, "LLM answers sound sure of themselves, even when the facts have moved on.");
  await sleep(5500);
  await caption(page, "StaleGuard finds the claims that can go stale and checks them against the live web.");
  await sleep(5500);
  await scrollTo(page, "#checker", 80, 1500);
  await caption(page, "Here is an answer a model could have given a year ago. Paste it in.");
  await page.locator("#answer").click();
  await page.locator("#answer").pressSequentially(ANSWER, { delay: 28 });
  await sleep(1500);
  await caption(page, "gpt-oss-120b, through the Bifrost gateway, finds the claims. Each one is then searched live with Tavily.");
  await page.getByRole("button", { name: "Check freshness" }).click();
  await finished(page);
  await sleep(2500);
  await caption(page, "Both claims come back stale. The card shows the value the sources give now, with dated sources.");
  await scrollTo(page, ".claim-card:has(.now)");
  await sleep(7000);
  await page.locator(".claim-card:has(.now) details.breakdown summary").first().click();
  await caption(page, "The score is a fixed formula, not a model's opinion. A verdict counts only when a source backs it.");
  await scrollTo(page, ".claim-card:has(.now) details.breakdown", 150, 1500);
  await sleep(7000);
  await scrollTo(page, ".corrected", 90, 1500);
  await caption(page, "The corrected answer changes only the outdated statements. A rewrite that touches anything else is dropped.");
  await page.getByRole("button", { name: "Show what changed" }).click();
  await sleep(8000);
  await scrollTo(page, ".usage", 200, 1500);
  await caption(page, "One gateway with its own virtual key, a budget and a rate limit. If gpt-oss-120b is limited, gpt-oss-20b answers.");
  await sleep(8000);
}

const END_CARD = `<!doctype html><meta charset="utf-8">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;600;700&family=JetBrains+Mono:wght@500&display=swap">
<body style="margin:0;height:100vh;background:#0d0d0d;color:#e4e4e7;font-family:'IBM Plex Sans',sans-serif;display:grid;place-items:center;text-align:center">
<div><div style="display:inline-grid;place-items:center;width:84px;height:84px;border-radius:18px;background:#39ff14"><svg viewBox="0 0 32 32" width="52" height="52"><path d="M16 2.5l11 4v8.2c0 7-4.6 12.2-11 14.8C9.6 26.9 5 21.7 5 14.7V6.5z" fill="#000"/><path d="M10.8 15.8l3.6 3.6 6.8-7.6" fill="none" stroke="#39ff14" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg></div>
<h1 style="font-size:84px;margin:22px 0 8px;letter-spacing:-.02em">Stale<span style="color:#39ff14">Guard</span></h1>
<p style="font:500 30px 'JetBrains Mono',monospace;color:#39ff14;margin:0 0 34px">github.com/6rzan/StaleGuard</p>
<p style="font-size:24px;color:#a1a1aa;line-height:1.6;margin:0">Esam Al-Areqi · Taha Thabit · Saadat Ahmed · Alaa Aldeen Alhakami</p></div>`;

async function segmentB(page) {
  await page.goto(base + "/#checker");
  await page.getByText("Live: Bifrost + Tavily").first().waitFor();
  await sleep(1000);
  await caption(page, "Ask mode: no paste step. A model answers the question, and StaleGuard checks that answer.");
  await page.getByRole("button", { name: "Ask a model" }).click();
  await sleep(1500);
  await page.locator("#question").click();
  await page.locator("#question").pressSequentially(QUESTION, { delay: 28 });
  await sleep(1000);
  await page.getByRole("button", { name: "Ask and check" }).click();
  await caption(page, "The answer is generated through the gateway, then every time-sensitive claim is re-checked against the web.");
  await finished(page);
  await sleep(1500);
  await scrollTo(page, ".result", 80, 1500);
  await caption(page, "If the model's training data is old, you watch it get caught. The same check is one POST on the API.");
  await sleep(7000);
  await scrollTo(page, ".claim-card:has(.now)");
  await caption(page, "Each stale claim carries the current value and the sources behind it.");
  await sleep(6000);
  await scrollTo(page, ".usage", 200, 1500);
  await caption(page, "Every stage is listed with the model that served it; a fallback would be tagged here.");
  await sleep(6000);
  await page.setContent(END_CARD);
  await page.evaluate(() => document.fonts.ready);
  await caption(page, "Built for the Global AI Hackathon 2026 (PS06), with Tavily and Bifrost.");
  await sleep(8000);
}

const wsl = (p) => "/mnt/" + p[0].toLowerCase() + p.slice(2).replaceAll("\\", "/");

if (only !== "assemble") {
  const browser = await chromium.launch();
  try {
    if (only !== "b") await record(browser, "a", segmentA);
    if (!only) {
      console.log("waiting 65 s between live checks (not part of the video)");
      await sleep(65000);
    }
    if (only !== "a") await record(browser, "b", segmentB);
  } finally {
    await browser.close();
  }
}

// -ss 0.7 drops the blank frames before the first page paint.
const norm = "scale=1280:720,fps=25,setsar=1";
const run = spawnSync(
  "wsl.exe",
  [
    "-u", "root", "-e", "ffmpeg", "-y", "-loglevel", "error",
    "-ss", "0.7", "-i", wsl(path.join(work, "a.webm")),
    "-ss", "0.7", "-i", wsl(path.join(work, "b.webm")),
    "-filter_complex", `[0:v]${norm}[a];[1:v]${norm}[b];[a][b]concat=n=2:v=1:a=0[v]`,
    "-map", "[v]", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "26", "-an", "-movflags", "+faststart",
    wsl(out),
  ],
  { stdio: "inherit" },
);
if (run.status !== 0) process.exit(run.status ?? 1);
console.log("wrote", out);
