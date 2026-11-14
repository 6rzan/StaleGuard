import type { Category, Check, Claim, ClaimStatus, Label, Stance } from "./types";

export const MAX_ANSWER = 8000;

export const LABEL_TEXT: Record<Label, string> = {
  fresh: "Fresh",
  review: "Needs review",
  stale: "Stale",
  unverified: "Unverified",
};

export const CATEGORY_TEXT: Record<Category, string> = {
  pricing: "Pricing",
  version: "Version",
  regulation: "Regulation",
  leadership: "Leadership",
  company_fact: "Company fact",
  statistic: "Statistic",
  other: "Other",
};

export const STANCE_TEXT: Record<Stance, string> = {
  supports: "Supports claim",
  contradicts: "Contradicts claim",
  neutral: "Neutral",
};

export const STATUS_TEXT: Record<ClaimStatus, string> = {
  pending: "Waiting",
  verifying: "Checking sources",
  done: "Done",
  skipped: "Not checked",
  error: "Error",
};

// Same thresholds the backend uses for claim labels (fresh >= 75, stale < 40).
export function labelForScore(score: number): Exclude<Label, "unverified"> {
  return score >= 75 ? "fresh" : score >= 40 ? "review" : "stale";
}

// Visual tone of a claim: its label once scored, otherwise its progress state.
export function claimTone(c: Claim): string {
  if (c.label) return c.label;
  if (c.status === "error") return "unverified";
  return c.status === "skipped" ? "skipped" : "pending";
}

export function claimStateWord(c: Claim): string {
  return c.label ? LABEL_TEXT[c.label] : c.status === "error" ? "Error" : STATUS_TEXT[c.status];
}

export function skippedReason(c: Claim): string {
  return c.time_sensitive ? "Beyond the claim limit, not checked" : "Timeless, not checked";
}

export function statusLine(check: Check): string {
  switch (check.status) {
    case "queued":
      return "Queued…";
    case "generating":
      return "Generating the answer…";
    case "extracting":
      return "Extracting claims…";
    case "verifying": {
      const todo = check.claims.filter((c) => c.status !== "skipped");
      const done = todo.filter((c) => c.status === "done" || c.status === "error").length;
      return `Verifying ${Math.min(done + 1, todo.length)} of ${todo.length}…`;
    }
    case "done":
      return `Finished in ${formatDuration(check.usage.duration_ms)}`;
    case "error":
      return "The check failed";
  }
}

const dateFmt = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeZone: "UTC" });
const relFmt = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

export function formatDate(iso: string | null): string {
  if (!iso) return "undated";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "undated" : dateFmt.format(d);
}

export function relativeTime(iso: string, now = Date.now()): string {
  const secs = Math.round((new Date(iso).getTime() - now) / 1000);
  const steps: [Intl.RelativeTimeFormatUnit, number][] = [
    ["day", 86400],
    ["hour", 3600],
    ["minute", 60],
  ];
  for (const [unit, size] of steps) {
    if (Math.abs(secs) >= size) return relFmt.format(Math.round(secs / size), unit);
  }
  return relFmt.format(secs, "second");
}

export function formatDuration(ms: number): string {
  return ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(1)} s`;
}

export const percent = (x: number) => `${Math.round(x * 100)}%`;

export function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
