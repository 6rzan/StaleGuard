import { ApiError, getCheck } from "./api";
import type { Check, CheckSummary } from "./types";

const KEY = "staleguard.history";
const MAX = 20;

// Storage can be blocked or full (private windows); the history then just stays empty.
function readIds(): string[] {
  try {
    const raw: unknown = JSON.parse(window.localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(raw) ? raw.filter((x): x is string => typeof x === "string").slice(0, MAX) : [];
  } catch {
    return [];
  }
}

function writeIds(ids: string[]) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(ids));
  } catch {
    // nothing to do: history is a convenience
  }
}

// Newest first, no duplicates, capped.
export function rememberCheck(id: string) {
  writeIds([id, ...readIds().filter((x) => x !== id)].slice(0, MAX));
}

const toSummary = (c: Check): CheckSummary => ({
  id: c.id,
  created_at: c.created_at,
  status: c.status,
  mode: c.mode,
  overall_score: c.overall_score,
  excerpt: Array.from(c.answer).slice(0, 120).join(""),
  summary: c.summary,
});

// Loads this browser's checks. Ids the server no longer has (404) are dropped for good;
// any other failure rejects so the panel can say it is unavailable.
export async function loadOwnChecks(): Promise<CheckSummary[]> {
  const ids = readIds();
  const results = await Promise.allSettled(ids.map((id) => getCheck(id)));
  const items: CheckSummary[] = [];
  const kept: string[] = [];
  results.forEach((r, i) => {
    if (r.status === "fulfilled") {
      items.push(toSummary(r.value));
      kept.push(ids[i]);
    } else if (!(r.reason instanceof ApiError && r.reason.status === 404)) {
      throw r.reason;
    }
  });
  if (kept.length < ids.length) writeIds(kept);
  return items;
}
