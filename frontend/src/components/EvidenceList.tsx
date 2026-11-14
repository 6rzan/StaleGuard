import { STANCE_TEXT, domainOf, formatDate } from "../format";
import type { Evidence } from "../types";
import { Icon } from "./Icon";

export function EvidenceList({ evidence }: { evidence: Evidence[] }) {
  return (
    <ul className="evidence">
      {evidence.map((e, i) => (
        <li key={`${e.url}#${i}`} className="evidence-item">
          <div className="evidence-top">
            <a
              href={/^https?:\/\//i.test(e.url) ? e.url : undefined}
              target="_blank"
              rel="noreferrer"
              className="evidence-title"
            >
              {e.title || e.url}
            </a>
            <span className="stance" data-stance={e.stance}>
              <Icon name={e.stance} />
              {STANCE_TEXT[e.stance]}
            </span>
          </div>
          <p className="evidence-meta">
            {domainOf(e.url)} · {formatDate(e.published_date)}
          </p>
          {e.snippet && <p className="evidence-snippet">{e.snippet}</p>}
        </li>
      ))}
    </ul>
  );
}
