import { LABEL_TEXT, labelForScore, relativeTime } from "../format";
import type { CheckSummary } from "../types";
import { Icon } from "./Icon";

type Props = {
  items: CheckSummary[] | null;
  failed: boolean;
  currentId: string | null;
  onOpen: (id: string) => void;
};

export function History({ items, failed, currentId, onOpen }: Props) {
  return (
    <aside className="history card" aria-labelledby="history-title">
      <h2 id="history-title">History</h2>
      {failed ? (
        <p className="muted">History is unavailable right now.</p>
      ) : items === null ? (
        <p className="muted">Loading…</p>
      ) : items.length === 0 ? (
        <p className="muted">Past checks will appear here.</p>
      ) : (
        <ul className="history-list">
          {items.map((h) => {
            const label = h.overall_score === null ? null : labelForScore(h.overall_score);
            return (
              <li key={h.id}>
                <button
                  type="button"
                  className="history-row"
                  aria-current={h.id === currentId ? "true" : undefined}
                  onClick={() => onOpen(h.id)}
                >
                  <span
                    className="score-chip"
                    data-tone={label ?? "pending"}
                    title={label ? LABEL_TEXT[label] : h.status === "error" ? "Failed" : "In progress"}
                  >
                    {label ? <Icon name={label} /> : null}
                    {h.overall_score ?? (h.status === "error" ? "Err" : "…")}
                  </span>
                  <span className="history-body">
                    <span className="history-excerpt">{h.excerpt}</span>
                    <span className="history-time">
                      {relativeTime(h.created_at)}
                      {h.mode === "mock" && " · mock"}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </aside>
  );
}
