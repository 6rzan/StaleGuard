import { useEffect, useMemo, useRef, useState } from "react";
import { wordDiff } from "../diff";

type Props = { original: string; corrected: string };

export function CorrectedAnswer({ original, corrected }: Props) {
  const [showDiff, setShowDiff] = useState(false);
  const [copy, setCopy] = useState<"idle" | "done" | "failed">("idle");
  const timer = useRef<number | undefined>(undefined);
  const parts = useMemo(() => (showDiff ? wordDiff(original, corrected) : []), [showDiff, original, corrected]);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  async function onCopy() {
    try {
      await navigator.clipboard.writeText(corrected);
      setCopy("done");
    } catch {
      setCopy("failed");
    }
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCopy("idle"), 2000);
  }

  return (
    <section className="card corrected" aria-labelledby="corrected-title">
      <div className="corrected-head">
        <h2 id="corrected-title">Corrected answer</h2>
        <div className="corrected-actions">
          <button type="button" className="btn btn-secondary btn-small" aria-pressed={showDiff} onClick={() => setShowDiff((v) => !v)}>
            {showDiff ? "Hide what changed" : "Show what changed"}
          </button>
          <button type="button" className="btn btn-secondary btn-small" onClick={() => void onCopy()}>
            Copy
          </button>
        </div>
      </div>
      <p className="copy-note" role="status" data-failed={copy === "failed"}>
        {copy === "done" && "Copied to the clipboard."}
        {copy === "failed" && "Copy failed. Select the text and copy it by hand."}
      </p>
      <p className="answer-text">
        {showDiff
          ? parts.map((p, i) =>
              p.kind === "same" ? (
                p.text
              ) : p.kind === "del" ? (
                <del key={i}>{p.text}</del>
              ) : (
                <ins key={i}>{p.text}</ins>
              ),
            )
          : corrected}
      </p>
      {showDiff && <p className="diff-key">Struck-through words were removed, underlined words were added.</p>}
    </section>
  );
}
