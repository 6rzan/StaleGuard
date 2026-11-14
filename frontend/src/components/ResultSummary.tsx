import { useEffect, useState } from "react";
import { LABEL_TEXT, labelForScore, statusLine } from "../format";
import { downloadReport } from "../report";
import type { Check, Label } from "../types";
import { Icon } from "./Icon";

const R = 52;
const CIRC = 2 * Math.PI * R;

function ScoreRing({ score }: { score: number | null }) {
  // Starts empty and fills on the next frame so the ring animates in.
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const raf = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  const label = score === null ? null : labelForScore(score);
  const offset = score !== null && shown ? CIRC * (1 - score / 100) : CIRC;
  return (
    <div
      className="ring"
      data-tone={label ?? "pending"}
      role="img"
      aria-label={
        label === null
          ? "Overall score not ready"
          : `Overall freshness score ${score} out of 100, ${LABEL_TEXT[label]}`
      }
    >
      <svg viewBox="0 0 120 120" aria-hidden="true" focusable="false">
        <circle className="ring-track" cx="60" cy="60" r={R} />
        <circle
          className="ring-value"
          cx="60"
          cy="60"
          r={R}
          strokeDasharray={CIRC}
          strokeDashoffset={offset}
          transform="rotate(-90 60 60)"
        />
      </svg>
      <div className="ring-text" aria-hidden="true">
        <span className="ring-number">{score ?? "–"}</span>
        <span className="ring-word">{label ? LABEL_TEXT[label] : "Scoring"}</span>
      </div>
    </div>
  );
}

const COUNTS: { key: keyof Check["summary"]; label: Label | "skipped"; text: string }[] = [
  { key: "fresh", label: "fresh", text: "Fresh" },
  { key: "review", label: "review", text: "Review" },
  { key: "stale", label: "stale", text: "Stale" },
  { key: "unverified", label: "unverified", text: "Unverified" },
  { key: "skipped", label: "skipped", text: "Skipped" },
];

export function ResultSummary({ check }: { check: Check }) {
  const failed = check.status === "error";
  const finished = check.status === "done";
  // A finished check without a score has nothing time-sensitive to rate.
  const nothing = finished && check.overall_score === null;
  const plain = nothing || failed;
  return (
    <section className="card summary" data-plain={plain} aria-labelledby="result-title">
      {!plain && <ScoreRing score={check.overall_score} />}
      <div className="summary-body">
        <h2 id="result-title">
          Freshness report
          {check.mode === "mock" && <span className="pill pill-mock">Mock data</span>}
        </h2>
        <p className="status-line" aria-live="polite" data-failed={failed}>
          {failed ? (check.error ?? "The check failed.") : statusLine(check)}
        </p>
        {nothing && <p className="nothing">No time-sensitive claims found in this answer.</p>}
        <ul className="counts">
          {COUNTS.map(({ key, label, text }) => (
            <li key={key} data-tone={label} data-zero={check.summary[key] === 0}>
              <Icon name={label} />
              <span className="count-num">{check.summary[key]}</span>
              <span className="count-word">{text}</span>
            </li>
          ))}
        </ul>
        {finished && (
          <button type="button" className="btn btn-secondary btn-small download" onClick={() => downloadReport(check)}>
            Download report
          </button>
        )}
      </div>
    </section>
  );
}
