import { useState } from "react";
import type { Check } from "../types";
import { AnswerView } from "./AnswerView";
import { ClaimCard } from "./ClaimCard";
import { ResultSummary } from "./ResultSummary";
import { UsageStrip } from "./UsageStrip";

function openCard(id: string) {
  const el = document.getElementById(`claim-${id}`);
  if (!el) return;
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" });
  el.focus({ preventScroll: true });
}

export function Result({ check }: { check: Check }) {
  // Shared by spans and cards so hovering or focusing one highlights the other.
  const [activeId, setActiveId] = useState<string | null>(null);
  const claims = [...check.claims].sort((a, b) => a.start - b.start);
  const finished = check.status === "done";

  return (
    <div className="result">
      <ResultSummary check={check} />
      {check.answer && (
        <AnswerView check={check} activeId={activeId} onActive={setActiveId} onOpen={openCard} />
      )}
      {claims.length > 0 && (
        <section aria-labelledby="claims-title">
          <h2 id="claims-title" className="section-title">
            Claims
          </h2>
          <ol className="claim-list">
            {claims.map((c, i) => (
              <ClaimCard key={c.id} claim={c} index={i + 1} active={activeId === c.id} onActive={setActiveId} />
            ))}
          </ol>
        </section>
      )}
      {finished && claims.length === 0 && (
        <p className="card muted">No factual claims were found in this answer.</p>
      )}
      {(finished || check.model_calls.length > 0) && <UsageStrip check={check} />}
    </div>
  );
}
