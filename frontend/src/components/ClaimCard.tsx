import { CATEGORY_TEXT, LABEL_TEXT, claimStateWord, claimTone, percent, skippedReason } from "../format";
import type { Check, Claim, ScoreBreakdown, Verdict } from "../types";
import { EvidenceList } from "./EvidenceList";
import { Icon } from "./Icon";

type Props = {
  claim: Claim;
  mode: Check["mode"];
  index: number;
  active: boolean;
  onActive: (id: string | null) => void;
};

const VERDICT_TEXT: Record<Verdict, string> = {
  current: "Still accurate according to current sources.",
  outdated: "Out of date: current sources say something different.",
  unverified: "Could not be verified against live sources.",
};

const FORMULA: Record<Verdict, string> = {
  current: "score = 65 + 35 x quality",
  outdated: "score = 35 x (1 - quality)",
  unverified: "score = 50 - 15 x volatility (high 1, medium 0.5, low 0)",
};

function Breakdown({ b }: { b: ScoreBreakdown }) {
  const rows: [string, string, string][] = [
    ["Verdict", b.verdict, "What the sources say about the claim."],
    ["Confidence", percent(b.confidence), "How sure the judge was about that verdict."],
    ["Recency", percent(b.recency), "How recent the sources are, weighed by how fast this kind of fact changes."],
    ["Agreement", percent(b.agreement), "Share of sources that agree with the verdict."],
    ["Quality", percent(b.quality), "Confidence x average of recency and agreement. Feeds the score."],
  ];
  return (
    <details className="breakdown">
      <summary>How this score was computed</summary>
      <dl>
        {rows.map(([name, value, caption]) => (
          <div key={name}>
            <dt>{name}</dt>
            <dd>
              <strong>{value}</strong>
              <span>{caption}</span>
            </dd>
          </div>
        ))}
      </dl>
      <p className="formula">{FORMULA[b.verdict]}</p>
    </details>
  );
}

export function ClaimCard({ claim: c, mode, index, active, onActive }: Props) {
  const id = `claim-${c.id}`;
  const common = {
    id,
    tabIndex: -1,
    "data-tone": claimTone(c),
    "data-active": active,
    onMouseEnter: () => onActive(c.id),
    onMouseLeave: () => onActive(null),
  };

  if (c.status === "skipped") {
    return (
      <li className="claim-card compact" {...common}>
        <span className="claim-num">{index}</span>
        <span className="compact-text">{c.text}</span>
        <span className="compact-note">
          <Icon name="skipped" />
          {skippedReason(c)}
        </span>
      </li>
    );
  }

  const busy = c.status === "pending" || c.status === "verifying";
  return (
    <li className="claim-card" {...common} data-busy={busy}>
      <div className="claim-head">
        <span className="claim-num">{index}</span>
        <p className="claim-text">{c.text}</p>
      </div>
      <div className="claim-tags">
        <span className="tag">{CATEGORY_TEXT[c.category]}</span>
        <span className="tag">{c.volatility} volatility</span>
        {c.cached && (
          <span className="tag" title="Verified recently; this result was reused instead of searching again.">
            cached
          </span>
        )}
        <span className="tag tag-state" data-tone={claimTone(c)}>
          {c.label ? <Icon name={c.label} /> : busy ? <i className="dot" /> : <Icon name="unverified" />}
          {claimStateWord(c)}
        </span>
      </div>

      {c.risk_reason && (
        <p className="risk">
          <span>Why it can go stale</span> {c.risk_reason}
        </p>
      )}

      {busy && (
        <div className="skeleton" aria-hidden="true">
          <span />
          <span />
        </div>
      )}

      {c.status === "error" && <p className="claim-error">{c.error ?? "This claim could not be checked."}</p>}

      {c.status === "done" && (
        <div className="reveal">
          <div>
            {c.label && c.freshness_score !== null && (
              <div className="verdict">
                <div className="score-row">
                  <span className="score-label" data-tone={c.label}>
                    <Icon name={c.label} />
                    {LABEL_TEXT[c.label]}
                  </span>
                  <div
                    className="bar"
                    role="meter"
                    aria-label="Freshness score"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={c.freshness_score}
                    data-tone={c.label}
                  >
                    <span style={{ width: `${c.freshness_score}%` }} />
                  </div>
                  <span className="score-num">{c.freshness_score}</span>
                </div>
                {c.verdict && <p className="verdict-text">{VERDICT_TEXT[c.verdict]}</p>}
                {c.current_value && (
                  <p className="now">
                    <span>Now:</span> {c.current_value}
                  </p>
                )}
                {c.explanation && <p className="explanation">{c.explanation}</p>}
              </div>
            )}

            {c.evidence.length > 0 && (
              <>
                <h3 className="sub">{mode === "mock" ? "Sources, mock fixtures" : "Sources, live web via Tavily"}</h3>
                <EvidenceList evidence={c.evidence} />
              </>
            )}
            {c.score_breakdown && <Breakdown b={c.score_breakdown} />}
          </div>
        </div>
      )}
    </li>
  );
}
