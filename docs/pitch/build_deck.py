"""Builds the StaleGuard pitch deck: StaleGuard-pitch.pptx and StaleGuard-pitch.pdf.

Run from anywhere:

    uv run --with python-pptx --with reportlab --with pillow python docs/pitch/build_deck.py

Optional, to write one PNG per page for a visual check (needs pymupdf):

    uv run --with python-pptx --with reportlab --with pillow --with pymupdf \
        python docs/pitch/build_deck.py --png some/folder

PDF route: the committed StaleGuard-pitch.pdf is exported by PowerPoint itself
(COM, ppSaveAsPDF), so it is exactly the deck that opens in PowerPoint. When
PowerPoint is not installed, or with --reportlab-pdf, the script falls back to
drawing the PDF directly with reportlab.

Look: the dark developer-tool theme of the product UI. The UI uses IBM Plex Sans
and JetBrains Mono; neither ships with Windows or Office, so the deck uses Segoe UI
and Consolas, which every Windows machine has. To switch, change FONTS and
PPT_FACE below and point FONT_DIR at the new files.

Slides are described once, as shapes, text and pictures in inches. The same
description is written to PowerPoint (native, editable shapes) and, for the
fallback, drawn into the PDF, so the two carry identical content. Text is measured
with the real font files from the Windows font folder; the build stops if a text
box would overflow. Edit the slide functions below and re-run.
"""

import argparse
import subprocess
import sys
import tempfile
from pathlib import Path

from PIL import Image
from pptx import Presentation
from pptx.dml.color import RGBColor
from pptx.enum.shapes import MSO_SHAPE
from pptx.enum.text import MSO_ANCHOR, PP_ALIGN
from pptx.util import Inches, Pt
from reportlab.lib.colors import HexColor
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas

HERE = Path(__file__).resolve().parent
MEDIA = HERE.parent / "media"
OUT_PPTX = HERE / "StaleGuard-pitch.pptx"
OUT_PDF = HERE / "StaleGuard-pitch.pdf"

W, H = 13.333, 7.5
MX = 0.6  # side margin
TOTAL = 9

# Palette: the product's dark theme. Neon green is the accent (black text on it);
# the four semantic colours are used only for fresh / review / stale / unverified.
BG = "0D0D0D"
CARD = "161616"
BORDER = "27272A"
BORDER2 = "3F3F46"
INK = "E4E4E7"
MUTED = "A1A1AA"
BLACK = "0D0D0D"
GREEN, GREEN_BG = "39FF14", "10260C"
AMBER, AMBER_BG = "FBBF24", "2A2210"
RED, RED_BG = "F87171", "2E1A1B"
SLATE, SLATE_BG = "94A3B8", "1E2430"

FONT_DIR = Path("C:/Windows/Fonts")
FONTS = {
    ("sans", False, False): ("SegoeUI", "segoeui.ttf"),
    ("sans", True, False): ("SegoeUI-B", "segoeuib.ttf"),
    ("sans", False, True): ("SegoeUI-I", "segoeuii.ttf"),
    ("mono", False, False): ("Consolas", "consola.ttf"),
    ("mono", True, False): ("Consolas-B", "consolab.ttf"),
    ("mono", False, True): ("Consolas-I", "consolai.ttf"),
}
PPT_FACE = {"sans": "Segoe UI", "mono": "Consolas"}
LEADING = 1.2  # line height as a multiple of the font size, fixed in both outputs
FIT_SLACK = 0.96  # wrap at 96% of the box width so PowerPoint never wraps earlier


def register_fonts():
    for name, file in FONTS.values():
        pdfmetrics.registerFont(TTFont(name, str(FONT_DIR / file)))


def face(style):
    return FONTS[(style["font"], style["bold"], style["italic"])][0]


# ---------------------------------------------------------------- slide model


class Slide:
    def __init__(self, bg=BG):
        self.bg = bg
        self.ops = []
        self.notes = ""

    def rect(self, x, y, w, h, fill=None, line=None, lw=0.75, r=0.0):
        self.ops.append(("rect", x, y, w, h, fill, line, lw, r))

    def oval(self, x, y, w, h, fill):
        self.ops.append(("oval", x, y, w, h, fill))

    def arrow(self, x, y, w, h, direction, fill):
        self.ops.append(("arrow", x, y, w, h, direction, fill))

    def image(self, path, x, y, w=None, h=None, border=BORDER):
        iw, ih = Image.open(path).size
        if w is None:
            w = h * iw / ih
        else:
            h = w * ih / iw
        self.ops.append(("image", str(path), x, y, w, h, border))
        return w, h

    def text(self, x, y, w, h, paras, anchor="top"):
        self.ops.append(("text", x, y, w, h, paras, anchor))


def para(text, size, color=INK, font="sans", bold=False, italic=False, after=0, align="l"):
    style = dict(font=font, bold=bold, italic=italic, color=color)
    return dict(runs=[(text, style)], size=size, after=after, align=align)


def runs(parts, size, after=0, align="l"):
    """parts: list of (text, overrides) built with the default sans/ink style."""
    out = []
    for text, over in parts:
        style = dict(font="sans", bold=False, italic=False, color=INK)
        style.update(over)
        out.append((text, style))
    return dict(runs=out, size=size, after=after, align=align)


def wrap(p, width_in):
    """Greedy word wrap of one paragraph; returns lines as lists of (word, style)."""
    size = p["size"]
    limit = width_in * 72 * FIT_SLACK
    words = []
    for text, style in p["runs"]:
        for word in text.split(" "):
            if word:
                words.append((word, style))
    lines, cur, cur_w = [], [], 0.0
    for word, style in words:
        ww = pdfmetrics.stringWidth(word, face(style), size)
        sp = pdfmetrics.stringWidth(" ", face(style), size) if cur else 0.0
        if cur and cur_w + sp + ww > limit:
            lines.append(cur)
            cur, cur_w, sp = [], 0.0, 0.0
        if ww > limit:
            raise ValueError(f"word too wide for its box: {word!r}")
        cur.append((word, style, sp))
        cur_w += sp + ww
    if cur:
        lines.append(cur)
    return lines


def text_height_pt(paras, width_in):
    total = 0.0
    for p in paras:
        total += len(wrap(p, width_in)) * p["size"] * LEADING + p["after"]
    return total - (paras[-1]["after"] if paras else 0)


def check_fit(slide_no, op):
    _, x, y, w, h, paras, _anchor = op
    need = text_height_pt(paras, w) / 72
    if need > h + 0.005:
        first = paras[0]["runs"][0][0][:40]
        raise ValueError(f"slide {slide_no}: text overflows its box ({need:.2f} in > {h:.2f} in): {first!r}")


# ------------------------------------------------------------- helpers (slides)


def chrome(s, n, eyebrow, title):
    s.text(MX, 0.42, 9, 0.3, [para(eyebrow.upper(), 12, GREEN, font="mono", bold=True)])
    s.text(MX, 0.74, W - 2 * MX, 0.7, [para(title, 32, INK, bold=True)])
    s.text(MX, 7.02, 8, 0.28, [para("StaleGuard  |  Global AI Hackathon 2026  |  PS06 Tavily + Bifrost", 11, MUTED)])
    s.text(W - MX - 1.5, 7.02, 1.5, 0.28, [para(f"{n} / {TOTAL}", 11, MUTED, font="mono", align="r")])


def card(s, x, y, w, h, fill=CARD, line=BORDER):
    s.rect(x, y, w, h, fill=fill, line=line, lw=1.0, r=0.1)


def pill(s, x, y, w, h, label, fill, color, size=13, bold=True, font="sans"):
    s.rect(x, y, w, h, fill=fill, r=h / 2)
    s.text(x, y, w, h, [para(label, size, color, font=font, bold=bold, align="c")], anchor="mid")


def number_dot(s, x, y, d, n):
    s.oval(x, y, d, d, GREEN)
    s.text(x, y, d, d, [para(str(n), 16, BLACK, font="mono", bold=True, align="c")], anchor="mid")


def caption(s, x, y, w, text, align="l"):
    s.text(x, y, w, 0.3, [para(text, 12, MUTED, italic=True, align=align)])


def heading_body(s, x, y, w, h, head, body, anchor="top", hsize=18):
    s.text(x, y, w, h, [para(head, hsize, INK, bold=True, after=6), para(body, 15, MUTED)], anchor=anchor)


# ---------------------------------------------------------------------- slides


def slide1():
    s = Slide(bg=BG)
    s.notes = (
        "StaleGuard catches outdated facts in AI answers before your users do. "
        "It is our entry for Global AI Hackathon 2026, problem statement PS06, built on Tavily for live search and Bifrost as the model gateway. "
        "The screenshot is the landing page of the app, running in mock mode; the whole thing starts with one docker compose up."
    )
    s.text(MX, 0.7, 8, 0.35, [para("GLOBAL AI HACKATHON 2026  |  PS06", 13, MUTED, font="mono", bold=True)])
    pill(s, MX, 1.3, 2.7, 0.4, "Tavily + Bifrost", CARD, MUTED, 13, False, font="mono")
    s.text(MX, 1.95, 6.8, 2.3, [
        para("Catch stale facts", 50, INK, bold=True),
        para("in AI answers", 50, GREEN, bold=True),
    ])
    s.text(MX, 4.2, 6.5, 1.0, [para("Catches outdated facts in AI answers before your users do.", 20, MUTED)])
    s.rect(MX, 5.15, 3.5, 0.6, fill=CARD, line=BORDER, lw=1.0, r=0.1)
    s.text(MX + 0.25, 5.15, 3.2, 0.6, [runs([("$ ", dict(color=MUTED, font="mono")), ("docker compose up", dict(font="mono", bold=True))], 18)], anchor="mid")
    s.text(MX, 6.1, 7.0, 0.8, [
        para("TEAM", 11, MUTED, font="mono", bold=True, after=3),
        para("Esam Al-Areqi (team leader), Taha Thabit, Saadat Ahmed, Alaa Aldeen Alhakami", 14, INK),
    ])
    iw, ih = s.image(MEDIA / "screenshot-landing.png", 7.6, 1.5, w=W - MX - 7.6)
    caption(s, 7.6, 1.5 + ih + 0.1, iw, "The app's landing page. Mock data.")
    return s


def slide2():
    s = Slide(bg=BG)
    s.notes = (
        "A model answers from what it learned, and it states old facts in the same confident tone as new ones. "
        "The three examples are illustrative: fictional companies from our bundled mock data, each with the value the mock sources give now. "
        "The people hurt are the ones who ship these answers to customers: support bots, docs assistants and sales answers."
    )
    chrome(s, 2, "The problem", "Models state old facts with full confidence")
    s.text(MX, 1.4, 11, 0.4, [para("Prices, versions, laws and job titles change. The answer does not.", 18, MUTED)])
    examples = [
        ("Pricing", "The Pro plan costs $20 per month per user.", "$25 per user per month since September 2026"),
        ("Version", "The latest stable release of the Lumen API is version 3.2.", "Version 4.0, released September 2026"),
        ("Leadership", "Kestrel Labs is led by CEO Maria Okafor.", "Daniel Reyes became CEO in August 2026"),
    ]
    cw, gap = 3.9, 0.2
    for i, (tag, claim, now) in enumerate(examples):
        x = MX + i * (cw + gap)
        card(s, x, 2.05, cw, 3.45)
        pill(s, x + 0.25, 2.3, 1.35, 0.34, tag, BORDER, INK, 12, True, font="mono")
        s.text(x + 0.25, 2.85, cw - 0.5, 1.3, [para(claim, 19, INK)])
        s.rect(x + 0.25, 4.3, cw - 0.5, 0.95, fill=RED_BG, r=0.08)
        s.text(x + 0.4, 4.36, cw - 0.8, 0.85, [
            para("NOW, PER MOCK SOURCES", 11, RED, font="mono", bold=True, after=2),
            para(now, 14, INK),
        ], anchor="mid")
    s.text(MX, 5.85, 1.5, 0.4, [para("Who is hurt", 15, INK, bold=True)], anchor="mid")
    for i, label in enumerate(["Support bots", "Docs assistants", "Sales answers"]):
        pill(s, 2.25 + i * 2.35, 5.85, 2.2, 0.4, label, CARD, GREEN, 14, True)
        s.rect(2.25 + i * 2.35, 5.85, 2.2, 0.4, line=BORDER2, lw=1.0, r=0.2)
    caption(s, MX, 6.5, 12, "Illustrative examples from the bundled mock data (fictional companies), not real claims.")
    return s


def slide3():
    s = Slide(bg=BG)
    s.notes = (
        "You paste an answer or type a question. StaleGuard finds each claim that can go stale, searches the live web for it and judges what the sources say. "
        "Each claim gets a score from 0 to 100, its sources and, when it is outdated, the current value. "
        "The screenshot is a mock-mode run on a fictional company: the Pro plan price is flagged stale and the corrected answer is shown below the report."
    )
    chrome(s, 3, "The solution", "Every time-sensitive claim, re-checked live")
    steps = [
        "Paste an answer, or ask a question.",
        "Every time-sensitive claim is found and searched on the live web.",
        "Each gets a 0 to 100 score, its sources and the current value.",
    ]
    for i, t in enumerate(steps):
        y = 1.95 + i * 1.5
        number_dot(s, MX, y, 0.55, i + 1)
        s.text(MX + 0.8, y - 0.05, 4.2, 1.2, [para(t, 19, INK)])
    iw, ih = s.image(MEDIA / "screenshot-report.png", 5.9, 1.75, w=W - MX - 5.9)
    caption(s, 5.9, 1.75 + ih + 0.1, iw, "Freshness report on a fictional company. Mock data.")
    return s


def slide4():
    s = Slide(bg=BG)
    s.notes = (
        "A check runs left to right. Two steps are model calls through Bifrost: extract the claims and judge the evidence. "
        "Search is Tavily. Flagging and scoring are plain code, so the number is never a model's opinion. "
        "Up to four claims are verified at the same time, and one failing claim never fails the whole check."
    )
    chrome(s, 4, "How it works", "Models read and judge, plain code decides")
    steps = [
        ("Answer", "Pasted or asked", "end"),
        ("Extract claims", "LLM via Bifrost", "model"),
        ("Flag|time-sensitive", "Plain code", "code"),
        ("Search", "Tavily, live web", "search"),
        ("Judge evidence", "LLM via Bifrost", "model"),
        ("Deterministic|score", "Plain code", "code"),
        ("Report", "Scores and sources", "end"),
    ]
    bw, gap, y, bh = 1.55, 0.21, 2.0, 1.55
    for i, (name, sub, kind) in enumerate(steps):
        x = MX + i * (bw + gap)
        if kind == "model":
            s.rect(x, y, bw, bh, fill=GREEN, r=0.12)
            c1, c2 = BLACK, "14330C"
        elif kind == "search":
            s.rect(x, y, bw, bh, fill=CARD, line=GREEN, lw=2.0, r=0.12)
            c1, c2 = GREEN, MUTED
        elif kind == "code":
            s.rect(x, y, bw, bh, fill=CARD, line=BORDER2, lw=1.25, r=0.12)
            c1, c2 = INK, MUTED
        else:
            s.rect(x, y, bw, bh, fill=BG, line=BORDER, lw=1.0, r=0.12)
            c1, c2 = INK, MUTED
        s.text(x + 0.08, y + 0.1, bw - 0.16, bh - 0.2, [
            *[para(part, 14, c1, bold=True, after=4 if j == name.count("|") else 0, align="c") for j, part in enumerate(name.split("|"))],
            para(sub, 12, c2, align="c"),
        ], anchor="mid")
        if i < len(steps) - 1:
            s.arrow(x + bw + 0.03, y + bh / 2 - 0.12, gap - 0.06, 0.24, "right", MUTED)
    ly = 3.95
    legend = [
        (GREEN, None, "Model call through the Bifrost gateway"),
        (CARD, GREEN, "Web search through Tavily"),
        (CARD, BORDER2, "Plain code, no model"),
    ]
    lx = MX
    for fill, line, label in legend:
        s.rect(lx, ly + 0.04, 0.32, 0.22, fill=fill, line=line, lw=1.5, r=0.05)
        s.text(lx + 0.42, ly, 3.4, 0.3, [para(label, 13, INK)], anchor="mid")
        lx += 4.05
    notes = [
        ("Four at a time", "Up to four claims are verified at the same time."),
        ("One failure stays small", "A failed claim becomes unverified and the check still finishes."),
        ("Optional last step", "One more model call rewrites only the outdated statements."),
    ]
    cw = 3.9
    for i, (h1, body) in enumerate(notes):
        x = MX + i * (cw + 0.2)
        card(s, x, 4.65, cw, 1.7)
        heading_body(s, x + 0.25, 4.85, cw - 0.5, 1.4, h1, body)
    return s


def slide5():
    s = Slide(bg=BG)
    s.notes = (
        "Every model call goes through one Bifrost endpoint, so the app never holds a provider key. "
        "Every stage, extract, judge, rewrite and the ask-mode answer, runs on gpt-oss-120b on Groq. On Groq free-tier rate limits Bifrost fails over to the smaller gpt-oss-20b. "
        "The app has its own virtual key with a 5 USD daily budget, 60 requests per minute and an allowed-model list, enforced by the gateway. "
        "The UI strip shows which model served each stage, tagged as fallback when gpt-oss-20b stepped in."
    )
    chrome(s, 5, "What Bifrost contributes", "One gateway for every model call")
    bx, bw = MX, 4.2
    s.rect(bx, 1.85, bw, 0.9, fill=CARD, line=BORDER, lw=1.0, r=0.1)
    s.text(bx, 1.85, bw, 0.9, [
        para("StaleGuard app", 17, INK, bold=True, align="c"),
        para("holds no provider key", 13, MUTED, align="c"),
    ], anchor="mid")
    s.arrow(bx + bw / 2 - 0.15, 2.82, 0.3, 0.4, "down", MUTED)
    s.rect(bx, 3.3, bw, 0.95, fill=GREEN, r=0.1)
    s.text(bx, 3.3, bw, 0.95, [
        para("Bifrost gateway", 19, BLACK, bold=True, align="c"),
        para("one endpoint, every model", 13, "14330C", align="c"),
    ], anchor="mid")
    s.arrow(bx + bw / 4 - 0.15, 4.32, 0.3, 0.4, "down", MUTED)
    s.arrow(bx + 3 * bw / 4 - 0.15, 4.32, 0.3, 0.4, "down", MUTED)
    pw = 2.0
    s.rect(bx, 4.8, pw, 0.95, fill=CARD, line=BORDER, lw=1.0, r=0.1)
    s.text(bx, 4.8, pw, 0.95, [
        para("Groq", 17, INK, bold=True, align="c"),
        para("gpt-oss-120b", 12, GREEN, font="mono", align="c"),
        para("every stage", 12, MUTED, font="mono", align="c"),
    ], anchor="mid")
    s.rect(bx + bw - pw, 4.8, pw, 0.95, fill=CARD, line=BORDER, lw=1.0, r=0.1)
    s.text(bx + bw - pw, 4.8, pw, 0.95, [
        para("Groq", 17, INK, bold=True, align="c"),
        para("gpt-oss-20b", 12, GREEN, font="mono", align="c"),
        para("failover", 12, MUTED, font="mono", align="c"),
    ], anchor="mid")
    items = [
        ("Per-stage routing", "One open-weight model family on Groq: gpt-oss-120b runs every stage. A model change is an env change."),
        ("Automatic failover", "On Groq free-tier rate limits the gateway fails over to the smaller gpt-oss-20b. The UI tags a fallback call."),
        ("Virtual key", "The app's own key: 5 USD a day, 60 requests a minute, allowed models only (the two gpt-oss models). The gateway enforces it."),
        ("Usage per stage", "Model and total tokens in the app, per-call tokens and latency in the API response."),
    ]
    cw, ch, gx, gy = 3.6, 2.2, 0.25, 0.25
    x0, y0 = W - MX - 2 * cw - gx, 1.85
    for i, (h1, body) in enumerate(items):
        x = x0 + (i % 2) * (cw + gx)
        y = y0 + (i // 2) * (ch + gy)
        card(s, x, y, cw, ch)
        heading_body(s, x + 0.25, y + 0.2, cw - 0.5, ch - 0.35, h1, body)
    return s


def slide6():
    s = Slide(bg=BG)
    s.notes = (
        "Tavily is where the evidence comes from. Each flagged claim gets one search, and the judge reads up to five ranked results with their dates and snippets. "
        "Leadership and company-fact claims use Tavily's news topic; everything else uses general search. "
        "The publication dates feed the recency part of the score, and a source with no date counts as neutral. The screenshot is a live run with real sources: Python 3.12 flagged stale, current value Python 3.15."
    )
    chrome(s, 6, "What Tavily contributes", "Live evidence for every flagged claim")
    items = [
        ("One search per claim", "Each flagged claim is searched on the live web, up to five results."),
        ("Ranked sources", "Every source has a title, URL, snippet, relevance and publication date."),
        ("Topic routing by claim type", "News topic for leadership and company facts, general search for the rest."),
        ("Recency feeds the score", "Source dates set the recency input. A source with no date counts as neutral."),
    ]
    cw, ch, gap = 7.2, 1.1, 0.15
    for i, (h1, body) in enumerate(items):
        y = 1.75 + i * (ch + gap)
        card(s, MX, y, cw, ch)
        s.text(MX + 0.3, y + 0.08, cw - 0.6, ch - 0.16, [
            para(h1, 17, INK, bold=True, after=3),
            para(body, 14, MUTED),
        ], anchor="mid")
    ih = 4.75
    iw, _ = s.image(MEDIA / "screenshot-live-claim.png", W - MX - ih * 864 / 990, 1.75, h=ih)
    caption(s, W - MX - iw - 1.2, 1.75 + ih + 0.08, iw + 1.2, "Live run: a stale claim with its sources", align="r")
    return s


def slide7():
    s = Slide(bg=BG)
    s.notes = (
        "The score is computed in code, not by a model. The model only gives a verdict, a confidence and a stance per source. "
        "Current claims land between 65 and 100, outdated between 0 and 35, and unverified between 35 and 50. "
        "In the worked example, from a mock-mode run, the Pro plan claim is outdated with confidence 0.9, so quality is 0.71 and the score is 10. Same inputs always give the same score."
    )
    chrome(s, 7, "The freshness score", "Deterministic score, every input visible")
    sx, sw = MX, 6.9
    bars = [
        ("Current", "Sources back the claim", 65, 100, GREEN),
        ("Outdated", "Sources contradict it", 0, 35, RED),
        ("Unverified", "Not enough evidence", 35, 50, SLATE),
    ]
    for i, (name, sub, lo, hi, color) in enumerate(bars):
        y = 1.75 + i * 0.95
        s.text(sx, y, sw, 0.3, [runs([(name, dict(bold=True, color=color)), ("   " + sub, dict(color=MUTED))], 14)])
        s.rect(sx, y + 0.38, sw, 0.3, fill=BORDER, r=0.06)
        bx = sx + sw * lo / 100
        bw = sw * (hi - lo) / 100
        s.rect(bx, y + 0.38, bw, 0.3, fill=color, r=0.06)
        s.text(bx, y + 0.38, bw, 0.3, [para(f"{lo} to {hi}", 12, BLACK, font="mono", bold=True, align="c")], anchor="mid")
    s.text(sx, 4.62, sw, 0.3, [para("Labels: stale below 40, review 40 to 74, fresh 75 and up.", 13, MUTED)])
    card(s, sx, 5.05, sw, 1.75)
    s.text(sx + 0.3, 5.15, sw - 0.6, 1.6, [
        para("quality = confidence x (recency + agreement) / 2", 15, GREEN, font="mono", after=6),
        runs([("Recency: ", dict(bold=True)), ("how new the sources are, scaled by how fast that fact type changes.", {})], 14, after=3),
        runs([("Agreement: ", dict(bold=True)), ("the share of sources that back the verdict.", {})], 14),
    ], anchor="mid")
    ex, ew = 7.95, W - MX - 7.95
    card(s, ex, 1.75, ew, 5.05)
    s.text(ex + 0.3, 1.9, ew - 0.6, 0.3, [para("WORKED EXAMPLE, MOCK DATA", 12, GREEN, font="mono", bold=True)])
    s.text(ex + 0.3, 2.25, ew - 0.6, 0.9, [para("The Pro plan costs $20 per month per user and includes unlimited projects.", 14, INK, italic=True)])
    rows = [("Verdict", "outdated"), ("Confidence", "0.90"), ("Recency", "0.57"), ("Agreement", "1.00"), ("Quality", "0.71")]
    for i, (k, v) in enumerate(rows):
        y = 3.3 + i * 0.36
        s.text(ex + 0.3, y, 2.2, 0.32, [para(k, 14, MUTED)], anchor="mid")
        s.text(ex + 2.5, y, 1.8, 0.32, [para(v, 14, INK, font="mono", bold=True)], anchor="mid")
    s.rect(ex + 0.3, 5.2, ew - 0.6, 1.35, fill=RED_BG, r=0.1)
    s.text(ex + 0.5, 5.2, 1.5, 1.35, [para("10", 52, RED, font="mono", bold=True)], anchor="mid")
    s.text(ex + 2.0, 5.2, ew - 2.4, 1.35, [
        para("Stale", 20, RED, bold=True, after=2),
        para("35 x (1 - 0.71) = 10", 13, INK, font="mono"),
    ], anchor="mid")
    return s


def slide8():
    s = Slide(bg=BG)
    s.notes = (
        "The prototype runs with one command and needs no keys: mock mode uses bundled fictional fixtures and makes no network calls. "
        "The backend has 84 tests and CI is green on four jobs: backend, frontend, e2e and docker. There are also 34 end-to-end tests. Other tools can call the JSON API as a verification layer. "
        "It has also run live: make smoke passed, and through the UI the answer about Python 3.12 and Node.js 20 finished in 13.3 seconds with both claims stale, current values Python 3.15 and Node.js 26 from dated sources, and all 4 model calls on gpt-oss-120b through Bifrost. The screenshot is that run."
    )
    chrome(s, 8, "Working prototype", "A working prototype that runs in one command")
    items = [
        ("One command", "$ docker compose up", True),
        ("Mock mode", "No keys, no network calls", False),
        ("Tested", "84 backend tests, 34 end-to-end tests; CI green on backend, frontend, e2e and docker", False),
        ("A verification layer", "POST /api/checks?wait=true returns the JSON report", False),
    ]
    for i, (h1, body, mono) in enumerate(items):
        y = 1.8 + i * 1.2
        s.oval(MX, y + 0.08, 0.2, 0.2, GREEN)
        s.text(MX + 0.4, y, 3.6, 1.1, [
            para(h1, 17, INK, bold=True, after=2),
            para(body, 13 if mono else 14, GREEN if mono else MUTED, font="mono" if mono else "sans"),
        ])
    ax, ih = 4.55, 3.9
    iw, _ = s.image(MEDIA / "screenshot-live-report.png", ax, 1.8, h=ih)
    caption(s, ax, 1.8 + ih + 0.08, iw, "Live run, real sources")
    bx = ax + iw + 0.25
    s.rect(bx, 1.8, 10.25 - bx, ih, fill=GREEN_BG, line=GREEN, lw=1.0, r=0.1)
    s.text(bx + 0.2, 1.8, 10.25 - bx - 0.4, ih, [
        para("Verified live", 16, GREEN, bold=True, after=6),
        para("make smoke passed. A real run: both claims stale, Python 3.15 and Node.js 26 from dated sources, 13.3 s, 4 model calls on gpt-oss-120b via Bifrost.", 13, INK),
    ], anchor="mid")
    mh = 4.85
    mw = mh * 750 / 1624
    mx = W - MX - mw
    s.image(MEDIA / "screenshot-mobile.png", mx, 1.8, h=mh)
    caption(s, mx - 0.4, 1.8 + mh + 0.08, mw + 0.4, "Phone layout. Mock data.", align="r")
    return s


def slide9():
    s = Slide(bg=BG)
    s.notes = (
        "Next we want the model to call Tavily itself as a tool through Bifrost's MCP gateway, instead of the fixed search-then-judge order. "
        "After that, a streaming proxy that annotates answers in place, and scheduled re-checks of saved answers. "
        "Esam, our team and organization leader, had the idea, led its implementation and wrote the build brief the project was built from; Taha owns the repository and the backend; Saadat covers prompts, tests and QA; Alaa built the frontend and the redesign. The whole project, specs and CI included, is in the public repository. "
        "The project was planned, written and reviewed with AI coding tools (Claude Code), and the README has the full disclosure."
    )
    chrome(s, 9, "What is next and team", "What is next, and the team")
    nxt = [
        ("Bifrost MCP gateway", "The model calls Tavily as a tool and decides when to search."),
        ("Streaming proxy", "Annotates answers in place as they stream."),
        ("Scheduled re-checks", "Saved answers are checked again on a schedule."),
    ]
    for i, (h1, body) in enumerate(nxt):
        y = 1.8 + i * 1.5
        number_dot(s, MX, y + 0.05, 0.55, i + 1)
        s.text(MX + 0.8, y, 4.6, 1.3, [
            para(h1, 19, INK, bold=True, after=4),
            para(body, 14, MUTED),
        ])
    tx, tw = 6.7, W - MX - 6.7
    c1 = 2.3
    s.text(tx, 1.75, c1, 0.35, [para("MEMBER", 12, GREEN, font="mono", bold=True)], anchor="mid")
    s.text(tx + c1, 1.75, tw - c1, 0.35, [para("AREA", 12, GREEN, font="mono", bold=True)], anchor="mid")
    team = [
        ("Esam Al-Areqi", "team and organization leader", "Had the idea and led its implementation; wrote the build brief; repo, CI, docs, deck, demo"),
        ("Taha Thabit", "repository owner", "Core engine and backend; Bifrost, Tavily and Groq integration; Docker; security and repo settings"),
        ("Saadat Ahmed", None, "Claim and judge prompts, mock data, backend tests, end-to-end suite and QA, security scanning"),
        ("Alaa Aldeen Alhakami", None, "Frontend and UI, the redesign, accessibility, responsive layout"),
    ]
    rh = 0.98
    for i, (name, role, area) in enumerate(team):
        y = 2.15 + i * rh
        card(s, tx, y, tw, rh - 0.1)
        nm = [para(name, 15, INK, bold=True)]
        if role:
            nm.append(para(role, 12, MUTED, italic=True))
        s.text(tx + 0.2, y, c1 - 0.3, rh - 0.1, nm, anchor="mid")
        s.text(tx + c1, y, tw - c1 - 0.2, rh - 0.1, [para(area, 13, INK)], anchor="mid")
    s.text(tx, 6.0, tw, 0.42, [
        para("Planned, written and reviewed with AI coding tools (Claude Code); full disclosure in the README.", 12, MUTED, italic=True),
    ])
    s.rect(MX, 6.5, W - 2 * MX, 0.45, fill=CARD, line=BORDER, lw=1.0, r=0.1)
    s.text(MX + 0.25, 6.5, W - 2 * MX - 0.5, 0.45, [
        runs([("Repo  ", dict(bold=True, color=GREEN, font="mono")), ("https://github.com/6rzan/StaleGuard", dict(font="mono"))], 15),
    ], anchor="mid")
    return s


# ------------------------------------------------------------------ writers


def rgb(hex_):
    return RGBColor.from_string(hex_)


def write_pptx(slides, path):
    prs = Presentation()
    prs.slide_width, prs.slide_height = Inches(W), Inches(H)
    prs.core_properties.title = "StaleGuard pitch deck"
    prs.core_properties.author = "StaleGuard team"
    blank = prs.slide_layouts[6]
    for sl in slides:
        slide = prs.slides.add_slide(blank)
        slide.background.fill.solid()
        slide.background.fill.fore_color.rgb = rgb(sl.bg)
        slide.notes_slide.notes_text_frame.text = sl.notes
        for op in sl.ops:
            kind = op[0]
            if kind in ("rect", "oval"):
                if kind == "rect":
                    _, x, y, w, h, fill, line, lw, r = op
                    shape_kind = MSO_SHAPE.ROUNDED_RECTANGLE if r else MSO_SHAPE.RECTANGLE
                else:
                    _, x, y, w, h, fill = op
                    line, lw, r = None, 0, 0
                    shape_kind = MSO_SHAPE.OVAL
                shp = slide.shapes.add_shape(shape_kind, Inches(x), Inches(y), Inches(w), Inches(h))
                if r:
                    shp.adjustments[0] = min(0.5, r / min(w, h))
                _style_shape(shp, fill, line, lw)
            elif kind == "arrow":
                _, x, y, w, h, d, fill = op
                k = MSO_SHAPE.RIGHT_ARROW if d == "right" else MSO_SHAPE.DOWN_ARROW
                shp = slide.shapes.add_shape(k, Inches(x), Inches(y), Inches(w), Inches(h))
                _style_shape(shp, fill, None, 0)
            elif kind == "image":
                _, p, x, y, w, h, border = op
                pic = slide.shapes.add_picture(p, Inches(x), Inches(y), Inches(w), Inches(h))
                if border:
                    pic.line.color.rgb = rgb(border)
                    pic.line.width = Pt(1)
            elif kind == "text":
                _, x, y, w, h, paras, anchor = op
                tb = slide.shapes.add_textbox(Inches(x), Inches(y), Inches(w), Inches(h))
                tf = tb.text_frame
                tf.word_wrap = True
                tf.margin_left = tf.margin_right = tf.margin_top = tf.margin_bottom = 0
                tf.vertical_anchor = MSO_ANCHOR.MIDDLE if anchor == "mid" else MSO_ANCHOR.TOP
                for i, p in enumerate(paras):
                    para_ = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
                    para_.alignment = {"l": PP_ALIGN.LEFT, "c": PP_ALIGN.CENTER, "r": PP_ALIGN.RIGHT}[p["align"]]
                    para_.line_spacing = Pt(p["size"] * LEADING)
                    para_.space_after = Pt(p["after"])
                    para_.space_before = Pt(0)
                    for text, st in p["runs"]:
                        run = para_.add_run()
                        run.text = text
                        f = run.font
                        f.name = PPT_FACE[st["font"]]
                        f.size = Pt(p["size"])
                        f.bold = st["bold"]
                        f.italic = st["italic"]
                        f.color.rgb = rgb(st["color"])
    prs.save(str(path))


def _style_shape(shp, fill, line, lw):
    shp.shadow.inherit = False
    if fill:
        shp.fill.solid()
        shp.fill.fore_color.rgb = rgb(fill)
    else:
        shp.fill.background()
    if line:
        shp.line.color.rgb = rgb(line)
        shp.line.width = Pt(lw)
    else:
        shp.line.fill.background()


def write_pdf(slides, path):
    c = canvas.Canvas(str(path), pagesize=(W * 72, H * 72))
    c.setTitle("StaleGuard pitch deck")
    c.setAuthor("StaleGuard team")
    ph = H * 72

    def Y(y_in):
        return ph - y_in * 72

    for sl in slides:
        c.setFillColor(HexColor("#" + sl.bg))
        c.rect(0, 0, W * 72, ph, stroke=0, fill=1)
        for op in sl.ops:
            kind = op[0]
            if kind == "rect":
                _, x, y, w, h, fill, line, lw, r = op
                _pdf_paint(c, fill, line, lw)
                if r:
                    c.roundRect(x * 72, Y(y + h), w * 72, h * 72, min(r, h / 2, w / 2) * 72, stroke=1 if line else 0, fill=1 if fill else 0)
                else:
                    c.rect(x * 72, Y(y + h), w * 72, h * 72, stroke=1 if line else 0, fill=1 if fill else 0)
            elif kind == "oval":
                _, x, y, w, h, fill = op
                _pdf_paint(c, fill, None, 0)
                c.ellipse(x * 72, Y(y + h), (x + w) * 72, Y(y), stroke=0, fill=1)
            elif kind == "arrow":
                _, x, y, w, h, d, fill = op
                _pdf_paint(c, fill, None, 0)
                if d == "right":
                    pts = [(0, .3), (.55, .3), (.55, 0), (1, .5), (.55, 1), (.55, .7), (0, .7)]
                else:
                    pts = [(.3, 0), (.7, 0), (.7, .55), (1, .55), (.5, 1), (0, .55), (.3, .55)]
                pth = c.beginPath()
                for i, (px, py) in enumerate(pts):
                    xx, yy = (x + px * w) * 72, Y(y + py * h)
                    pth.moveTo(xx, yy) if i == 0 else pth.lineTo(xx, yy)
                pth.close()
                c.drawPath(pth, stroke=0, fill=1)
            elif kind == "image":
                _, p, x, y, w, h, border = op
                c.drawImage(p, x * 72, Y(y + h), w * 72, h * 72)
                if border:
                    c.setStrokeColor(HexColor("#" + border))
                    c.setLineWidth(1)
                    c.rect(x * 72, Y(y + h), w * 72, h * 72, stroke=1, fill=0)
            elif kind == "text":
                _, x, y, w, h, paras, anchor = op
                total = text_height_pt(paras, w)
                top = y * 72 + ((h * 72 - total) / 2 if anchor == "mid" else 0)
                for p in paras:
                    size = p["size"]
                    for line in wrap(p, w):
                        base = ph - (top + size * 0.95 + (LEADING - 1.2) * size)
                        widths = [
                            pdfmetrics.stringWidth(wd, face(st), size) + sp_w
                            for wd, st, sp in line
                            for sp_w in [pdfmetrics.stringWidth(" ", face(st), size) if sp else 0.0]
                        ]
                        total_w = sum(widths)
                        cx = x * 72
                        if p["align"] == "c":
                            cx += (w * 72 - total_w) / 2
                        elif p["align"] == "r":
                            cx += w * 72 - total_w
                        for (wd, st, sp), wd_w in zip(line, widths):
                            sp_w = pdfmetrics.stringWidth(" ", face(st), size) if sp else 0.0
                            c.setFillColor(HexColor("#" + st["color"]))
                            c.setFont(face(st), size)
                            c.drawString(cx + sp_w, base, wd)
                            cx += wd_w
                        top += size * LEADING
                    top += p["after"]
        c.showPage()
    c.save()


def _pdf_paint(c, fill, line, lw):
    if fill:
        c.setFillColor(HexColor("#" + fill))
    if line:
        c.setStrokeColor(HexColor("#" + line))
        c.setLineWidth(lw)


# --------------------------------------------------------------------- main

POWERPOINT = Path("C:/Program Files/Microsoft Office/root/Office16/POWERPNT.EXE")


def export_with_powerpoint(pptx, pdf, tmp):
    """Export through PowerPoint COM; returns False when it is not available or fails."""
    if not POWERPOINT.exists():
        return False
    # Quitting would also close a PowerPoint session someone else has open.
    if "POWERPNT.EXE" in subprocess.run(["tasklist"], capture_output=True, text=True).stdout:
        print("PowerPoint is already running; close it to export the PDF through it")
        return False
    out = tmp / "powerpoint-export.pdf"
    script = (
        "$ErrorActionPreference='Stop';"
        "$app=New-Object -ComObject PowerPoint.Application;"
        "try{"
        f"$d=$app.Presentations.Open('{pptx}',-1,0,0);"
        f"$d.SaveAs('{out}',32);$d.Close()"
        "}finally{$app.Quit()}"
    )
    try:
        subprocess.run(["powershell", "-NoProfile", "-Command", script], check=True, timeout=180)
    except (subprocess.SubprocessError, OSError):
        return False
    if not out.exists():
        return False
    pdf.write_bytes(out.read_bytes())
    return True


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--reportlab-pdf", action="store_true", help="skip PowerPoint and draw the PDF with reportlab")
    ap.add_argument("--out-dir", help="write the deck here instead of next to this script")
    ap.add_argument("--png", help="folder to write one PNG per PDF page (needs pymupdf)")
    args = ap.parse_args()

    register_fonts()
    global OUT_PPTX, OUT_PDF
    if args.out_dir:
        Path(args.out_dir).mkdir(parents=True, exist_ok=True)
        OUT_PPTX, OUT_PDF = Path(args.out_dir) / OUT_PPTX.name, Path(args.out_dir) / OUT_PDF.name
    tmp = Path(tempfile.mkdtemp(prefix="staleguard-deck-"))

    slides = [slide1(), slide2(), slide3(), slide4(), slide5(), slide6(), slide7(), slide8(), slide9()]
    assert len(slides) == TOTAL
    problems = []
    for n, sl in enumerate(slides, 1):
        for op in sl.ops:
            if op[0] == "text":
                try:
                    check_fit(n, op)
                except ValueError as e:
                    problems.append(str(e))
    if problems:
        print("\n".join(problems), file=sys.stderr)
        sys.exit(1)

    write_pptx(slides, OUT_PPTX)
    if args.reportlab_pdf or not export_with_powerpoint(OUT_PPTX, OUT_PDF, tmp):
        write_pdf(slides, OUT_PDF)
        print("PDF drawn with reportlab (fallback)")
    else:
        print("PDF exported by PowerPoint")
    print(f"wrote {OUT_PPTX.name} and {OUT_PDF.name}")

    if args.png:
        import fitz  # pymupdf

        out = Path(args.png)
        out.mkdir(parents=True, exist_ok=True)
        with fitz.open(OUT_PDF) as doc:
            for i, page in enumerate(doc, 1):
                page.get_pixmap(dpi=110).save(out / f"slide-{i}.png")


if __name__ == "__main__":
    main()
