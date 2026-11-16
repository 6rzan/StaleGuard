# API contract (backend ⇄ frontend). Base path `/api`. JSON everywhere.

Field names and enum values here are binding for `backend/app/models.py` and `frontend/src/types.ts`.

## Endpoints

| Method | Path | Request | Response |
|---|---|---|---|
| GET | `/api/health` | – | `200 Health` |
| GET | `/api/samples` | – | `200 Sample[]` |
| POST | `/api/checks` | `CheckRequest` (`?wait=true` optional) | `202 {"id": "..."}`; with `wait=true`: `200 Check` (finished); live mode only: `429 {"detail": "..."}` over the request limits |
| GET | `/api/checks` | `?limit=20` (max 50) | `200 CheckSummary[]`, newest first, only when `SHARED_HISTORY=true`; otherwise `404 {"detail": "..."}` |
| GET | `/api/checks/{id}` | – | `200 Check` or `404 {"detail": "..."}` |

Validation errors: `422` (FastAPI default body).

Request limits (live mode only; mock mode has none):

- More than `RATE_LIMIT_PER_MINUTE` (default 6) `POST /api/checks` from one client address in a rolling minute: `429 {"detail": "Too many checks. Wait a minute and try again."}` with a `Retry-After` header (seconds).
- More than `DAILY_LIVE_CHECKS` (default 100) checks in one UTC day: `429 {"detail": "..."}` until the next UTC day.

A rejected request stores nothing and calls no provider.

History: `GET /api/checks` is off by default (`SHARED_HISTORY=false`) because it would list every stored check, with its text, to anyone who can reach the server. The client keeps the ids of its own checks and loads each with `GET /api/checks/{id}`.

The client polls `GET /api/checks/{id}` every second until `status` is `done` or `error`.

## Shapes

```ts
type Health = {
  status: "ok";
  mode: "mock" | "live";
  version: string;
  models: { extract: string; judge: string; answer: string; fallbacks: string[] };
};

type Sample = { id: string; title: string; question: string | null; answer: string };

// At least one of answer / question is required. answer: 1..8000 chars.
// Both given: answer is checked and question is stored with it.
// question without answer = "ask mode" (post-MVP): the answer is generated first.
type CheckRequest = { answer?: string; question?: string };

type CheckStatus = "queued" | "generating" | "extracting" | "verifying" | "done" | "error";
type Category = "pricing" | "version" | "regulation" | "leadership" | "company_fact" | "statistic" | "other";
type Volatility = "high" | "medium" | "low";
type ClaimStatus = "pending" | "verifying" | "done" | "skipped" | "error";
type Verdict = "current" | "outdated" | "unverified";
type Label = "fresh" | "review" | "stale" | "unverified";
type Stance = "supports" | "contradicts" | "neutral";

type Evidence = {
  title: string;
  url: string;
  snippet: string;
  published_date: string | null; // ISO 8601
  score: number;                 // search relevance 0..1
  stance: Stance;
};

type Claim = {
  id: string;                    // "c1", "c2", ...
  text: string;                  // exact substring of Check.answer
  start: number;                 // offsets in Unicode code points, not UTF-16 units:
  end: number;                   // Array.from(answer).slice(start, end).join("") === text
  category: Category;
  time_sensitive: boolean;
  volatility: Volatility;
  risk_reason: string;
  search_query: string;
  status: ClaimStatus;           // "skipped" = timeless or beyond MAX_CLAIMS
  verdict: Verdict | null;
  freshness_score: number | null; // integer 0..100
  label: Label | null;
  current_value: string | null;  // what sources say now (when outdated)
  explanation: string | null;
  confidence: number | null;     // 0..1
  score_breakdown: { verdict: Verdict; confidence: number; recency: number; agreement: number; quality: number } | null;
  evidence: Evidence[];
  cached: boolean;               // post-MVP, false until then
  error: string | null;
};

type ModelCall = {
  stage: "answer" | "extract" | "judge" | "rewrite";
  requested: string;             // "openai/gpt-4o-mini"
  served_by: string;             // provider/model that answered
  is_fallback: boolean;
  prompt_tokens: number;
  completion_tokens: number;
  latency_ms: number;
};

type Check = {
  id: string;
  created_at: string;            // ISO 8601 UTC
  status: CheckStatus;
  mode: "mock" | "live";
  question: string | null;
  answer: string;                // "" while status is "generating"
  corrected_answer: string | null; // post-MVP
  overall_score: number | null;
  summary: { fresh: number; review: number; stale: number; unverified: number; skipped: number };
  claims: Claim[];
  model_calls: ModelCall[];
  usage: { llm_calls: number; prompt_tokens: number; completion_tokens: number; search_calls: number; cache_hits: number; duration_ms: number };
  error: string | null;
};

type CheckSummary = {
  id: string; created_at: string; status: CheckStatus; mode: "mock" | "live";
  overall_score: number | null; excerpt: string; // first 120 chars of the answer
  summary: Check["summary"];
};
```

## Example claim (finished, outdated)

```json
{
  "id": "c1",
  "text": "The Pro plan costs $20 per month",
  "start": 0, "end": 32,
  "category": "pricing", "time_sensitive": true, "volatility": "high",
  "risk_reason": "Subscription prices change often.",
  "search_query": "Northwind Cloud Pro plan price per month",
  "status": "done", "verdict": "outdated", "freshness_score": 9, "label": "stale",
  "current_value": "$25 per month since September 2026",
  "explanation": "Two recent sources list the Pro plan at $25 per month.",
  "confidence": 0.9,
  "score_breakdown": { "verdict": "outdated", "confidence": 0.9, "recency": 0.66, "agreement": 1.0, "quality": 0.75 },
  "evidence": [
    { "title": "Northwind Cloud pricing", "url": "https://example.com/northwind/pricing", "snippet": "Pro: $25/month, billed monthly.", "published_date": "2026-10-02T00:00:00Z", "score": 0.93, "stance": "contradicts" }
  ],
  "cached": false, "error": null
}
```
