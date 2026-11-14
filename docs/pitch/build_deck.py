"""Builds the StaleGuard pitch deck: StaleGuard-pitch.pptx and StaleGuard-pitch.pdf.

Run from anywhere:

    uv run --with python-pptx --with reportlab --with pillow python docs/pitch/build_deck.py

Optional, to write one PNG per page for a visual check (needs pymupdf):

    uv run --with python-pptx --with reportlab --with pillow --with pymupdf \
        python docs/pitch/build_deck.py --png some/folder

PDF route: the committed StaleGuard-pitch.pdf is exported by PowerPoint itself
(COM, ppSaveAsPDF), so it is exactly the deck that opens in PowerPoint. When
PowerPoint is not installed, or with --reportlab-pdf, the script falls back to
drawing the PDF directly with reportlab. Pass --png to render whichever PDF was
written. The reportlab twin is also written next to the temp files for comparison.

Slides are described once, as shapes, text and pictures in inches. The same
description is written to PowerPoint (native, editable shapes) and, for the
fallback, drawn into the PDF, so the two carry identical content. Text is measured
with the real Georgia and Calibri files from the Windows font folder; the build
stops if a text box would overflow. Edit the slide functions below and re-run.
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

# Palette: the product's warm paper, near-black ink, deep teal; the four
# semantic colours are used only for fresh / review / stale / unverified.
PAPER = "F6F3EC"
CARD = "FFFDF8"
BORDER = "DDD5C6"
INK = "1F1B16"
MUTED = "5E574C"
TEAL = "0E5A66"
TEAL_DARK = "0A3F49"
TEAL_PALE = "DCEBEC"
GREEN, GREEN_BG = "1F7A4D", "D9EDDD"
AMBER, AMBER_BG = "8A5A00", "FCEFC7"
RED, RED_BG = "B3261E", "F9DCDA"
SLATE, SLATE_BG = "4F5A70", "E2E5EC"

FONT_DIR = Path("C:/Windows/Fonts")
FONTS = {
    ("sans", False, False): ("Calibri", "calibri.ttf"),
    ("sans", True, False): ("Calibri-B", "calibrib.ttf"),
    ("sans", False, True): ("Calibri-I", "calibrii.ttf"),
    ("serif", False, False): ("Georgia", "georgia.ttf"),
    ("serif", True, False): ("Georgia-B", "georgiab.ttf"),
    ("serif", False, True): ("Georgia-I", "georgiai.ttf"),
}
PPT_FACE = {"sans": "Calibri", "serif": "Georgia"}
LEADING = 1.2  # line height as a multiple of the font size, fixed in both outputs
FIT_SLACK = 0.96  # wrap at 96% of the box width so PowerPoint never wraps earlier


def register_fonts():
    for name, file in FONTS.values():
        pdfmetrics.registerFont(TTFont(name, str(FONT_DIR / file)))


def face(style):
    return FONTS[(style["font"], style["bold"], style["italic"])][0]


# ---------------------------------------------------------------- slide model


class Slide:
    def __init__(self, bg=PAPER):
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
    s.text(MX, 0.42, 9, 0.3, [para(eyebrow.upper(), 13, TEAL, bold=True)])
    s.text(MX, 0.74, W - 2 * MX, 0.7, [para(title, 32, INK, font="serif", bold=True)])
    s.text(MX, 7.02, 8, 0.28, [para("StaleGuard  |  Global AI Hackathon 2026  |  PS06 Tavily + Bifrost", 11, MUTED)])
    s.text(W - MX - 1.5, 7.02, 1.5, 0.28, [para(f"{n} / {TOTAL}", 11, MUTED, align="r")])


def card(s, x, y, w, h, fill=CARD, line=BORDER):
    s.rect(x, y, w, h, fill=fill, line=line, lw=0.75, r=0.12)


def pill(s, x, y, w, h, label, fill, color, size=13, bold=True):
    s.rect(x, y, w, h, fill=fill, r=h / 2)
    s.text(x, y, w, h, [para(label, size, color, bold=bold, align="c")], anchor="mid")


def number_dot(s, x, y, d, n, fill=TEAL):
    s.oval(x, y, d, d, fill)
    s.text(x, y, d, d, [para(str(n), 16, "FFFFFF", font="serif", bold=True, align="c")], anchor="mid")


def caption(s, x, y, w, text, align="l"):
    s.text(x, y, w, 0.3, [para(text, 12, MUTED, italic=True, align=align)])


# ---------------------------------------------------------------------- slides


def slide1():
    s = Slide(bg=TEAL_DARK)
    s.notes = (
        "StaleGuard catches outdated facts in AI answers before your users do. "
        "It is our entry for Global AI Hackathon 2026, problem statement PS06, built on Tavily for live search and Bifrost as the model gateway. "
        "The cards on the right show the four labels every claim can get; the scores are from our mock-data sample runs."
    )
    s.text(MX, 0.7, 8, 0.35, [para("GLOBAL AI HACKATHON 2026  |  PS06  |  TAVILY + BIFROST", 14, "9FC9CE", bold=True)])
    s.text(MX, 1.7, 8, 1.4, [para("StaleGuard", 80, PAPER, font="serif", bold=True)])
    s.text(MX, 3.35, 7.4, 1.5, [para("Catches outdated facts in AI answers before your users do.", 30, PAPER, font="serif")])
    s.text(MX, 5.7, 7.6, 0.9, [
        para("Team", 12, "9FC9CE", bold=True, after=3),
        para("Esam Al-Areqi (team leader), Taha Thabit, Saadat Ahmed, Alaa Aldeen Alhakami", 16, PAPER),
    ])
    rows = [
        ("91", "Fresh", GREEN_BG, GREEN),
        ("73", "Review", AMBER_BG, AMBER),
        ("10", "Stale", RED_BG, RED),
        ("43", "Unverified", SLATE_BG, SLATE),
    ]
    x, w, h = 9.0, 3.73, 0.95
    for i, (num, label, bg, fg) in enumerate(rows):
        y = 1.2 + i * 1.15
        s.rect(x, y, w, h, fill=bg, r=0.14)
        s.text(x + 0.3, y, 1.2, h, [para(num, 40, fg, font="serif", bold=True)], anchor="mid")
        s.text(x + 1.6, y, w - 1.8, h, [para(label, 22, fg, bold=True)], anchor="mid")
    s.text(x, 5.85, w, 0.5, [para("Scores from mock-mode sample runs on fictional companies.", 12, "9FC9CE", italic=True)])
    return s


def slide2():
    s = Slide()
    s.notes = (
        "A model answers from what it learned, and it states old facts in the same confident tone as new ones. "
        "The three examples are illustrative: fictional companies from our bundled mock data, each with the value the mock sources give now. "
        "The people hurt are the ones who ship these answers to customers: support bots, docs assistants and sales answers."
    )
    chrome(s, 2, "The problem", "Models state old facts with full confidence")
    s.text(MX, 1.4, 11, 0.4, [para("Prices, versions, laws and job titles change. The answer does not.", 20, MUTED, font="serif", italic=True)])
    examples = [
        ("Pricing", "The Pro plan costs $20 per month per user.", "$25 per user per month since September 2026"),
        ("Version", "The latest stable release of the Lumen API is version 3.2.", "Version 4.0, released September 2026"),
        ("Leadership", "Kestrel Labs is led by CEO Maria Okafor.", "Daniel Reyes became CEO in August 2026"),
    ]
    cw, gap = 3.9, 0.2
    for i, (tag, claim, now) in enumerate(examples):
        x = MX + i * (cw + gap)
        card(s, x, 2.05, cw, 3.45)
        pill(s, x + 0.25, 2.3, 1.25, 0.34, tag, TEAL_PALE, TEAL, 13)
        s.text(x + 0.25, 2.85, cw - 0.5, 1.3, [para(claim, 21, INK, font="serif")])
        s.rect(x + 0.25, 4.3, cw - 0.5, 0.95, fill=RED_BG, r=0.08)
        s.text(x + 0.4, 4.36, cw - 0.8, 0.85, [
            para("NOW, PER MOCK SOURCES", 11, RED, bold=True, after=2),
            para(now, 15, INK),
        ], anchor="mid")
    s.text(MX, 5.85, 1.5, 0.4, [para("Who is hurt", 15, INK, bold=True)], anchor="mid")
    for i, label in enumerate(["Support bots", "Docs assistants", "Sales answers"]):
        pill(s, 2.2 + i * 2.3, 5.85, 2.1, 0.4, label, TEAL_PALE, TEAL, 15)
    caption(s, MX, 6.5, 12, "Illustrative examples from the bundled mock data (fictional companies), not real claims.")
    return s


def slide3():
    s = Slide()
    s.notes = (
        "You paste an answer or type a question. StaleGuard finds each claim that can go stale, searches the live web for it and judges what the sources say. "
        "Each claim gets a score from 0 to 100, its sources and, when it is outdated, the current value. "
        "The screenshot is a mock-mode run on a fictional company: the Pro plan price is flagged stale and the corrected answer is shown below the report."
    )
    chrome(s, 3, "The solution", "Every time-sensitive claim, re-checked live")
    steps = [
        ("Paste an answer, or ask a question.", None),
        ("Every time-sensitive claim is found and searched on the live web.", None),
        ("Each gets a 0 to 100 score, its sources and the current value.", None),
    ]
    for i, (t, _) in enumerate(steps):
        y = 1.95 + i * 1.5
        number_dot(s, MX, y, 0.55, i + 1)
        s.text(MX + 0.8, y - 0.05, 4.2, 1.2, [para(t, 20, INK)])
    iw, ih = s.image(MEDIA / "screenshot-report.png", 5.9, 1.75, w=W - MX - 5.9)
    caption(s, 5.9, 1.75 + ih + 0.1, iw, "Freshness report on a fictional company. Mock data.")
    return s


def slide4():
    s = Slide()
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
        ("Deterministic score", "Plain code", "code"),
        ("Report", "Scores and sources", "end"),
    ]
    bw, gap, y, bh = 1.55, 0.21, 2.0, 1.55
    for i, (name, sub, kind) in enumerate(steps):
        x = MX + i * (bw + gap)
        if kind == "model":
            s.rect(x, y, bw, bh, fill=TEAL, r=0.12)
            c1, c2 = "FFFFFF", "BFE0E3"
        elif kind == "search":
            s.rect(x, y, bw, bh, fill=TEAL_PALE, line=TEAL, lw=1.5, r=0.12)
            c1, c2 = TEAL_DARK, TEAL
        elif kind == "code":
            s.rect(x, y, bw, bh, fill=CARD, line=INK, lw=1.25, r=0.12)
            c1, c2 = INK, MUTED
        else:
            s.rect(x, y, bw, bh, fill=PAPER, line=BORDER, lw=1.0, r=0.12)
            c1, c2 = INK, MUTED
        s.text(x + 0.1, y + 0.1, bw - 0.2, bh - 0.2, [
            *[para(part, 14, c1, bold=True, after=4 if j == name.count("|") else 0, align="c") for j, part in enumerate(name.split("|"))],
            para(sub, 12, c2, align="c"),
        ], anchor="mid")
        if i < len(steps) - 1:
            s.arrow(x + bw + 0.03, y + bh / 2 - 0.12, gap - 0.06, 0.24, "right", MUTED)
    ly = 3.95
    legend = [
        (TEAL, None, "Model call through the Bifrost gateway"),
        (TEAL_PALE, TEAL, "Web search through Tavily"),
        (CARD, INK, "Plain code, no model"),
    ]
    lx = MX
    for fill, line, label in legend:
        s.rect(lx, ly + 0.04, 0.32, 0.22, fill=fill, line=line, lw=1.25, r=0.05)
        s.text(lx + 0.42, ly, 3.3, 0.3, [para(label, 14, INK)], anchor="mid")
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
        s.text(x + 0.25, 4.85, cw - 0.5, 1.4, [
            para(h1, 18, INK, font="serif", bold=True, after=6),
            para(body, 15, MUTED),
        ])
    return s


def slide5():
    s = Slide()
    s.notes = (
        "Every model call goes through one Bifrost endpoint, so the app never holds a provider key. "
        "A cheap model extracts claims, a stronger one judges evidence, and changing either is an environment change. "
        "If a call fails over to a fallback model, the UI shows which model actually served it, together with tokens and latency for each call."
    )
    chrome(s, 5, "What Bifrost contributes", "One gateway for every model call")
    # left: small architecture diagram
    bx, bw = MX, 4.2
    s.rect(bx, 1.85, bw, 0.9, fill=CARD, line=BORDER, r=0.12)
    s.text(bx, 1.85, bw, 0.9, [
        para("StaleGuard app", 18, INK, bold=True, align="c"),
        para("holds no provider key", 13, MUTED, align="c"),
    ], anchor="mid")
    s.arrow(bx + bw / 2 - 0.15, 2.82, 0.3, 0.4, "down", MUTED)
    s.rect(bx, 3.3, bw, 0.95, fill=TEAL, r=0.12)
    s.text(bx, 3.3, bw, 0.95, [
        para("Bifrost gateway", 20, "FFFFFF", font="serif", bold=True, align="c"),
        para("one OpenAI-compatible endpoint", 13, "BFE0E3", align="c"),
    ], anchor="mid")
    s.arrow(bx + bw / 4 - 0.15, 4.32, 0.3, 0.4, "down", MUTED)
    s.arrow(bx + 3 * bw / 4 - 0.15, 4.32, 0.3, 0.4, "down", MUTED)
    pw = 2.0
    s.rect(bx, 4.8, pw, 0.8, fill=CARD, line=BORDER, r=0.1)
    s.text(bx, 4.8, pw, 0.8, [para("OpenAI", 17, INK, bold=True, align="c")], anchor="mid")
    s.rect(bx + bw - pw, 4.8, pw, 0.8, fill=CARD, line=BORDER, r=0.1)
    s.text(bx + bw - pw, 4.8, pw, 0.8, [
        para("Anthropic", 17, INK, bold=True, align="c"),
        para("failover", 12, MUTED, italic=True, align="c"),
    ], anchor="mid")
    # right: 2x2 cards
    items = [
        ("Per-stage routing", "A cheap model extracts claims, a stronger one judges. Changing a model is an env change."),
        ("Automatic failover", "Fallback models are set per request. The UI shows which model served each call."),
        ("Virtual keys", "The gateway applies budgets and rate limits per app through a virtual key."),
        ("Usage per stage", "Tokens, latency and serving model for every call, in the app and in Bifrost."),
    ]
    cw, ch, gx, gy = 3.6, 2.0, 0.25, 0.25
    x0, y0 = W - MX - 2 * cw - gx, 1.85
    for i, (h1, body) in enumerate(items):
        x = x0 + (i % 2) * (cw + gx)
        y = y0 + (i // 2) * (ch + gy)
        card(s, x, y, cw, ch)
        s.text(x + 0.25, y + 0.2, cw - 0.5, ch - 0.35, [
            para(h1, 18, INK, font="serif", bold=True, after=6),
            para(body, 15, MUTED),
        ])
    return s


def slide6(claim_crop):
    s = Slide()
    s.notes = (
        "Tavily is where the evidence comes from. Each flagged claim gets one search, and the judge reads up to five ranked results with their dates and snippets. "
        "Leadership and company-fact claims use Tavily's news topic; everything else uses general search. "
        "The publication dates feed the recency part of the score, and a source with no date counts as neutral. The screenshot is mock data."
    )
    chrome(s, 6, "What Tavily contributes", "Live evidence for every flagged claim")
    items = [
        ("One search per claim", "Each flagged claim is searched on the live web, up to five results."),
        ("Ranked sources", "Every source comes with title, URL, snippet, relevance and publication date."),
        ("Topic routing by claim type", "News topic for leadership and company facts, general search for the rest."),
        ("Recency feeds the score", "Source dates set the recency input. A source with no date counts as neutral."),
    ]
    cw, ch, gap = 7.6, 1.1, 0.15
    for i, (h1, body) in enumerate(items):
        y = 1.75 + i * (ch + gap)
        card(s, MX, y, cw, ch)
        s.text(MX + 0.3, y + 0.1, cw - 0.6, ch - 0.2, [
            para(h1, 18, INK, font="serif", bold=True, after=3),
            para(body, 15, MUTED),
        ], anchor="mid")
    ih = 4.75
    iw = ih * Image.open(claim_crop).size[0] / Image.open(claim_crop).size[1]
    ix = W - MX - iw
    s.image(claim_crop, ix, 1.75, h=ih)
    caption(s, ix - 0.6, 1.75 + ih + 0.08, iw + 0.6, "A stale claim with its sources. Mock data.", align="r")
    return s


def slide7():
    s = Slide()
    s.notes = (
        "The score is computed in code, not by a model. The model only gives a verdict, a confidence and a stance per source. "
        "Current claims land between 65 and 100, outdated between 0 and 35, and unverified between 35 and 50. "
        "In the worked example, from a mock-mode run, the Pro plan claim is outdated with confidence 0.9, so quality is 0.71 and the score is 10. Same inputs always give the same score."
    )
    chrome(s, 7, "The freshness score", "Deterministic score, every input visible")
    # score scale
    sx, sw = MX, 6.9
    bars = [
        ("Current", "Sources back the claim", 65, 100, GREEN),
        ("Outdated", "Sources contradict it", 0, 35, RED),
        ("Unverified", "Not enough evidence", 35, 50, SLATE),
    ]
    for i, (name, sub, lo, hi, color) in enumerate(bars):
        y = 1.75 + i * 0.95
        s.text(sx, y, sw, 0.3, [runs([(name, dict(bold=True, color=color)), ("   " + sub, dict(color=MUTED))], 15)])
        s.rect(sx, y + 0.38, sw, 0.3, fill=BORDER, r=0.06)
        bx = sx + sw * lo / 100
        bw = sw * (hi - lo) / 100
        s.rect(bx, y + 0.38, bw, 0.3, fill=color, r=0.06)
        s.text(bx, y + 0.38, bw, 0.3, [para(f"{lo} to {hi}", 12, "FFFFFF", bold=True, align="c")], anchor="mid")
    s.text(sx, 4.62, sw, 0.3, [para("Labels: stale below 40, review 40 to 74, fresh 75 and up.", 13, MUTED)])
    card(s, sx, 5.05, sw, 1.75, fill=CARD)
    s.text(sx + 0.3, 5.15, sw - 0.6, 1.6, [
        para("quality = confidence x (half recency + half agreement)", 17, TEAL, font="serif", italic=True, after=6),
        runs([("Recency: ", dict(bold=True)), ("how new the sources are, scaled by how fast that kind of fact changes.", {})], 14, after=3),
        runs([("Agreement: ", dict(bold=True)), ("the share of sources that back the verdict.", {})], 14),
    ], anchor="mid")
    # worked example
    ex, ew = 7.95, W - MX - 7.95
    card(s, ex, 1.75, ew, 5.05)
    s.text(ex + 0.3, 1.9, ew - 0.6, 0.3, [para("WORKED EXAMPLE, MOCK DATA", 12, TEAL, bold=True)])
    s.text(ex + 0.3, 2.25, ew - 0.6, 0.9, [para("The Pro plan costs $20 per month per user and includes unlimited projects.", 15, INK, font="serif", italic=True)])
    rows = [("Verdict", "outdated"), ("Confidence", "0.90"), ("Recency", "0.57"), ("Agreement", "1.00"), ("Quality", "0.71")]
    for i, (k, v) in enumerate(rows):
        y = 3.3 + i * 0.36
        s.text(ex + 0.3, y, 2.2, 0.32, [para(k, 15, MUTED)], anchor="mid")
        s.text(ex + 2.5, y, 1.8, 0.32, [para(v, 15, INK, bold=True)], anchor="mid")
    s.rect(ex + 0.3, 5.2, ew - 0.6, 1.35, fill=RED_BG, r=0.1)
    s.text(ex + 0.5, 5.2, 1.5, 1.35, [para("10", 56, RED, font="serif", bold=True)], anchor="mid")
    s.text(ex + 2.0, 5.2, ew - 2.4, 1.35, [
        para("Stale", 20, RED, bold=True, after=2),
        para("35 x (1 - 0.71) = 10", 14, INK),
    ], anchor="mid")
    return s


def slide8():
    s = Slide()
    s.notes = (
        "The prototype runs with one command and needs no keys: mock mode uses bundled fictional fixtures and makes no network calls. "
        "The backend has 72 tests and CI is green on three jobs: backend, frontend and docker. Other tools can call the JSON API as a verification layer. "
        "To be straight about it: live mode with real Bifrost and Tavily keys is wired and tested against mocked transports, but the first real run, make smoke, has not happened yet."
    )
    chrome(s, 8, "Working prototype", "A working prototype that runs in one command")
    items = [
        ("One command", "docker compose up"),
        ("Mock mode", "No keys, no network calls"),
        ("Tested", "72 backend tests; CI green on backend, frontend and docker"),
        ("A verification layer", "POST /api/checks?wait=true returns the JSON report"),
    ]
    for i, (h1, body) in enumerate(items):
        y = 1.8 + i * 1.2
        s.oval(MX, y + 0.08, 0.2, 0.2, TEAL)
        s.text(MX + 0.4, y, 3.55, 1.1, [
            para(h1, 18, INK, bold=True, after=2),
            para(body, 15, MUTED),
        ])
    ax = 4.85
    aw, ah = s.image(MEDIA / "screenshot-ask.png", ax, 1.8, w=5.3)
    caption(s, ax, 1.8 + ah + 0.08, aw, "Ask mode on a fictional API. Mock data.")
    ny = 1.8 + ah + 0.55
    s.rect(ax, ny, aw, 6.8 - ny, fill=AMBER_BG, r=0.1)
    s.text(ax + 0.2, ny, aw - 0.4, 6.8 - ny, [
        runs([("Live path not run yet. ", dict(bold=True, color=AMBER)),
              ("Real Bifrost and Tavily calls are tested against mocked transports; the first run with keys is make smoke.", {})], 14),
    ], anchor="mid")
    mh = 4.85
    mw = mh * 750 / 1624
    mx = W - MX - mw
    s.image(MEDIA / "screenshot-mobile.png", mx, 1.8, h=mh)
    caption(s, mx - 0.4, 1.8 + mh + 0.08, mw + 0.4, "Phone layout. Mock data.", align="r")
    return s


def slide9():
    s = Slide()
    s.notes = (
        "Next we want the model to call Tavily itself as a tool through Bifrost's MCP gateway, instead of the fixed search-then-judge order. "
        "After that, a streaming proxy that annotates answers in place, and scheduled re-checks of saved answers. "
        "The team splits the work as shown, and the whole project, specs and CI included, is in the public repository. "
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
            para(h1, 20, INK, font="serif", bold=True, after=4),
            para(body, 15, MUTED),
        ])
    tx, tw = 6.7, W - MX - 6.7
    c1 = 2.3
    s.text(tx, 1.75, c1, 0.35, [para("MEMBER", 12, TEAL, bold=True)], anchor="mid")
    s.text(tx + c1, 1.75, tw - c1, 0.35, [para("AREA", 12, TEAL, bold=True)], anchor="mid")
    team = [
        ("Esam Al-Areqi", "team leader", "Repo setup, CI, README, docs, pitch deck, demo"),
        ("Taha Thabit", None, "Core engine and backend, Bifrost and Tavily integration, Docker"),
        ("Saadat Ahmed", None, "Prompts (the claim and judge agents), mock adapters, fixtures, tests, smoke test"),
        ("Alaa Aldeen Alhakami", None, "Frontend and UI"),
    ]
    rh = 0.98
    for i, (name, role, area) in enumerate(team):
        y = 2.15 + i * rh
        card(s, tx, y, tw, rh - 0.1)
        nm = [para(name, 16, INK, bold=True)]
        if role:
            nm.append(para(role, 13, MUTED, italic=True))
        s.text(tx + 0.2, y, c1 - 0.3, rh - 0.1, nm, anchor="mid")
        s.text(tx + c1, y, tw - c1 - 0.2, rh - 0.1, [para(area, 14, INK)], anchor="mid")
    s.text(tx, 6.0, tw, 0.42, [
        para("Planned, written and reviewed with AI coding tools (Claude Code); full disclosure in the README.", 12, MUTED, italic=True),
    ])
    s.rect(MX, 6.5, W - 2 * MX, 0.45, fill=TEAL_PALE, r=0.1)
    s.text(MX + 0.25, 6.5, W - 2 * MX - 0.5, 0.45, [
        runs([("Repo  ", dict(bold=True, color=TEAL)), ("https://github.com/6rzan/ai-global-hackathon", dict(color=INK))], 16),
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
    ap.add_argument("--png", help="folder to write one PNG per PDF page (needs pymupdf)")
    args = ap.parse_args()

    register_fonts()
    tmp = Path(tempfile.mkdtemp(prefix="staleguard-deck-"))
    # Crop the claim card out of the full screenshot; the original file is untouched.
    claim_crop = tmp / "claim-card.png"
    Image.open(MEDIA / "screenshot-claim.png").crop((205, 0, 835, 790)).save(claim_crop)

    slides = [slide1(), slide2(), slide3(), slide4(), slide5(), slide6(claim_crop), slide7(), slide8(), slide9()]
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
