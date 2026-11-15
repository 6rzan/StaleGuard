import type { APIRequestContext } from "@playwright/test";

// Just the parts of the API the specs compare against; the full contract lives in frontend/src/types.ts.
export type ApiClaim = { id: string; text: string; start: number; status: string; freshness_score: number | null; label: string | null };
export type ApiCheck = {
  id: string;
  status: string;
  overall_score: number | null;
  summary: { fresh: number; review: number; stale: number; unverified: number; skipped: number };
  claims: ApiClaim[];
  usage: { cache_hits: number };
};
export type ApiSample = { id: string; title: string; question: string | null; answer: string };

export async function samples(request: APIRequestContext): Promise<ApiSample[]> {
  const res = await request.get("/api/samples");
  return (await res.json()) as ApiSample[];
}

export async function runCheck(request: APIRequestContext, answer: string): Promise<ApiCheck> {
  const res = await request.post("/api/checks?wait=true", { data: { answer } });
  return (await res.json()) as ApiCheck;
}

// Short letters-only token: makes an answer unique without adding digits the mock rules would read as a version.
export const token = () => Math.random().toString(36).replace(/[^a-z]/g, "").slice(0, 8).padEnd(8, "x");
