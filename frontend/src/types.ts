// Mirrors specs/001-stale-answer-detector/contracts/api.md field for field.

export type Health = {
  status: "ok";
  mode: "mock" | "live";
  version: string;
  models: { extract: string; judge: string; answer: string; fallbacks: string[] };
};

export type Sample = { id: string; title: string; question: string | null; answer: string };

// Exactly one of answer / question is required. answer: 1..8000 chars.
export type CheckRequest = { answer?: string; question?: string };

export type CheckStatus = "queued" | "generating" | "extracting" | "verifying" | "done" | "error";
export type Category =
  | "pricing"
  | "version"
  | "regulation"
  | "leadership"
  | "company_fact"
  | "statistic"
  | "other";
export type Volatility = "high" | "medium" | "low";
export type ClaimStatus = "pending" | "verifying" | "done" | "skipped" | "error";
export type Verdict = "current" | "outdated" | "unverified";
export type Label = "fresh" | "review" | "stale" | "unverified";
export type Stance = "supports" | "contradicts" | "neutral";

export type Evidence = {
  title: string;
  url: string;
  snippet: string;
  published_date: string | null; // ISO 8601
  score: number; // search relevance 0..1
  stance: Stance;
};

export type ScoreBreakdown = {
  verdict: Verdict;
  confidence: number;
  recency: number;
  agreement: number;
  quality: number;
};

export type Claim = {
  id: string; // "c1", "c2", ...
  text: string; // exact substring of Check.answer
  start: number; // code point offsets: Array.from(answer).slice(start, end).join("") === text
  end: number;
  category: Category;
  time_sensitive: boolean;
  volatility: Volatility;
  risk_reason: string;
  search_query: string;
  status: ClaimStatus; // "skipped" = timeless or beyond MAX_CLAIMS
  verdict: Verdict | null;
  freshness_score: number | null; // integer 0..100
  label: Label | null;
  current_value: string | null; // what sources say now (when outdated)
  explanation: string | null;
  confidence: number | null; // 0..1
  score_breakdown: ScoreBreakdown | null;
  evidence: Evidence[];
  cached: boolean; // post-MVP, false until then
  error: string | null;
};

export type ModelCall = {
  stage: "answer" | "extract" | "judge" | "rewrite";
  requested: string; // "openai/gpt-4o-mini"
  served_by: string; // provider/model that answered
  is_fallback: boolean;
  prompt_tokens: number;
  completion_tokens: number;
  latency_ms: number;
};

export type Summary = { fresh: number; review: number; stale: number; unverified: number; skipped: number };

export type Usage = {
  llm_calls: number;
  prompt_tokens: number;
  completion_tokens: number;
  search_calls: number;
  cache_hits: number;
  duration_ms: number;
};

export type Check = {
  id: string;
  created_at: string; // ISO 8601 UTC
  status: CheckStatus;
  mode: "mock" | "live";
  question: string | null;
  answer: string; // "" while status is "generating"
  corrected_answer: string | null; // post-MVP
  overall_score: number | null;
  summary: Summary;
  claims: Claim[];
  model_calls: ModelCall[];
  usage: Usage;
  error: string | null;
};

export type CheckSummary = {
  id: string;
  created_at: string;
  status: CheckStatus;
  mode: "mock" | "live";
  overall_score: number | null;
  excerpt: string; // first 120 chars of the answer
  summary: Summary;
};
