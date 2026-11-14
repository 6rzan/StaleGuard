import { LABEL_TEXT, domainOf, formatDate, formatDuration, percent } from "./format";
import type { Check } from "./types";

const quote = (text: string) => text.split("\n").map((l) => `> ${l}`).join("\n");
const linkText = (text: string) => text.replace(/[[\]]/g, "\\$&");

export function buildReport(check: Check): string {
  const { summary, usage } = check;
  const lines: string[] = [
    "# StaleGuard report",
    "",
    `- Check: ${check.id}`,
    `- Created: ${check.created_at}`,
    `- Data: ${check.mode === "mock" ? "mock fixtures, not live sources" : "live web via Tavily, models via Bifrost"}`,
    `- Overall freshness score: ${check.overall_score === null ? "not scored" : `${check.overall_score} / 100`}`,
    `- Claims: ${summary.fresh} fresh, ${summary.review} need review, ${summary.stale} stale, ${summary.unverified} unverified, ${summary.skipped} skipped`,
    "",
  ];

  if (check.question) lines.push("## Question", "", quote(check.question), "");
  lines.push("## Answer", "", quote(check.answer), "", "## Verified claims", "");

  const verified = check.claims.filter((c) => c.status === "done");
  if (verified.length === 0) lines.push("No time-sensitive claims were verified.", "");
  verified.forEach((c, i) => {
    lines.push(`### ${i + 1}. ${c.text}`, "");
    if (c.label !== null) lines.push(`- Label: ${LABEL_TEXT[c.label]}, score ${c.freshness_score ?? "n/a"} / 100`);
    if (c.verdict) lines.push(`- Verdict: ${c.verdict}${c.confidence === null ? "" : ` (confidence ${percent(c.confidence)})`}`);
    if (c.current_value) lines.push(`- Current value: ${c.current_value}`);
    if (c.explanation) lines.push(`- Explanation: ${c.explanation}`);
    if (c.risk_reason) lines.push(`- Why it can go stale: ${c.risk_reason}`);
    if (c.cached) lines.push("- Verified recently (cached result)");
    if (c.evidence.length > 0) {
      lines.push("", "Sources:", "");
      for (const e of c.evidence) {
        lines.push(`- [${linkText(e.title || e.url)}](${e.url}), ${domainOf(e.url)}, ${formatDate(e.published_date)}, ${e.stance}`);
      }
    }
    lines.push("");
  });

  if (check.corrected_answer) lines.push("## Corrected answer", "", quote(check.corrected_answer), "");

  lines.push("## Models and usage", "");
  for (const m of check.model_calls) {
    lines.push(`- ${m.stage}: ${m.requested}${m.is_fallback ? ` (fallback, served by ${m.served_by})` : ""}`);
  }
  lines.push(
    `- Tokens: ${usage.prompt_tokens + usage.completion_tokens}, searches: ${usage.search_calls}, cache hits: ${usage.cache_hits}, duration: ${formatDuration(usage.duration_ms)}`,
    "",
  );
  return lines.join("\n");
}

export function downloadReport(check: Check) {
  const url = URL.createObjectURL(new Blob([buildReport(check)], { type: "text/markdown;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `staleguard-report-${check.id}.md`;
  document.body.append(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
