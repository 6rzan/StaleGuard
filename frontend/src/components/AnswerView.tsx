import type { KeyboardEvent, ReactNode } from "react";
import { LABEL_TEXT, claimStateWord, claimTone } from "../format";
import type { Check } from "../types";
import { Icon } from "./Icon";

type Props = {
  check: Check;
  activeId: string | null;
  onActive: (id: string | null) => void;
  onOpen: (id: string) => void;
};

const LEGEND = ["fresh", "review", "stale", "unverified"] as const;

export function AnswerView({ check, activeId, onActive, onOpen }: Props) {
  const { answer } = check;
  const generating = answer === "" && check.status === "generating";
  // Claims never overlap; the guard only protects the render from bad data.
  const claims = [...check.claims].sort((a, b) => a.start - b.start);
  const nodes: ReactNode[] = [];
  let cursor = 0;

  for (const c of claims) {
    if (c.start < cursor || c.end > answer.length || c.end <= c.start) continue;
    if (c.start > cursor) nodes.push(answer.slice(cursor, c.start));
    const tone = claimTone(c);
    const index = claims.indexOf(c) + 1;
    // Keep the tag on the span's last word so it never wraps onto a line alone.
    const text = answer.slice(c.start, c.end);
    const split = Math.max(0, text.search(/\S+$/));
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onOpen(c.id);
      }
    };
    nodes.push(
      <span
        key={c.id}
        className="claim-span"
        data-tone={tone}
        data-active={activeId === c.id}
        data-busy={c.status === "pending" || c.status === "verifying"}
        role="button"
        tabIndex={0}
        aria-label={`Claim ${index}, ${claimStateWord(c)}: ${c.text}. Go to details.`}
        onClick={() => onOpen(c.id)}
        onKeyDown={onKey}
        onMouseEnter={() => onActive(c.id)}
        onMouseLeave={() => onActive(null)}
        onFocus={() => onActive(c.id)}
        onBlur={() => onActive(null)}
      >
        {text.slice(0, split)}
        <span className="nowrap">
          {text.slice(split)}
          <span className="claim-tag" aria-hidden="true">
            {c.label ? <Icon name={c.label} /> : c.status === "skipped" ? null : <i className="dot" />}
            {index}
          </span>
        </span>
      </span>,
    );
    cursor = c.end;
  }
  if (cursor < answer.length) nodes.push(answer.slice(cursor));

  const question = check.question && (
    <p className="question">
      <span>Question</span> {check.question}
    </p>
  );

  if (generating) {
    return (
      <section className="card answer-card" aria-labelledby="answer-title">
        <h2 id="answer-title" className="sr-only">
          The answer
        </h2>
        {question}
        <p className="loading" role="status">
          <span className="spinner" aria-hidden="true" />
          Generating an answer through the gateway…
        </p>
      </section>
    );
  }

  return (
    <section className="card answer-card" aria-labelledby="answer-title">
      {question}
      <div className="answer-head">
        <h2 id="answer-title">The answer</h2>
        <ul className="legend" aria-label="Highlight colours">
          {LEGEND.map((l) => (
            <li key={l} data-tone={l}>
              <Icon name={l} />
              {LABEL_TEXT[l]}
            </li>
          ))}
        </ul>
      </div>
      <p className="answer-text">{nodes}</p>
    </section>
  );
}
