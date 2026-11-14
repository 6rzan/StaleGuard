import { useState } from "react";
import { MAX_ANSWER } from "../format";
import type { CheckRequest, Sample } from "../types";

type Props = {
  samples: Sample[];
  running: boolean;
  onSubmit: (req: CheckRequest) => void;
};

type Mode = "check" | "ask";

const MODES: { id: Mode; label: string }[] = [
  { id: "check", label: "Check an answer" },
  { id: "ask", label: "Ask a model" },
];

export function InputCard({ samples, running, onSubmit }: Props) {
  const [mode, setMode] = useState<Mode>("check");
  const [text, setText] = useState("");
  const [question, setQuestion] = useState("");
  const ask = mode === "ask";
  const empty = (ask ? question : text).trim().length === 0;
  // In ask mode only samples that carry a question are useful as chips.
  const chips = ask ? samples.filter((s) => s.question) : samples;

  return (
    <section className="card input-card" aria-labelledby="input-title">
      <div className="segmented" role="group" aria-label="Input mode">
        {MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            className="segment"
            aria-pressed={mode === m.id}
            onClick={() => setMode(m.id)}
          >
            {m.label}
          </button>
        ))}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (empty || running) return;
          onSubmit(ask ? { question } : { answer: text });
        }}
      >
        {ask ? (
          <>
            <label id="input-title" htmlFor="question" className="field-label">
              Ask a question
            </label>
            <input
              id="question"
              type="text"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="For example: What does the Pro plan cost?"
              autoComplete="off"
            />
            <p className="hint">The answer is generated through the gateway, then checked for stale claims.</p>
          </>
        ) : (
          <>
            <label id="input-title" htmlFor="answer" className="field-label">
              Paste an AI-generated answer
            </label>
            <textarea
              id="answer"
              value={text}
              onChange={(e) => setText(e.target.value)}
              maxLength={MAX_ANSWER}
              rows={7}
              placeholder="Paste the answer you want to fact-check, for example a model reply with prices, versions or names."
              aria-describedby="answer-count"
            />
          </>
        )}
        <div className="input-foot">
          {ask ? (
            <span />
          ) : (
            <p id="answer-count" className="counter">
              {text.length.toLocaleString("en")} / {MAX_ANSWER.toLocaleString("en")}
            </p>
          )}
          <button type="submit" className="btn btn-primary" disabled={empty || running}>
            {running ? "Checking…" : ask ? "Ask and check" : "Check freshness"}
          </button>
        </div>
      </form>
      {chips.length > 0 && (
        <div className="samples">
          <p className="samples-label" id="samples-label">
            Or try a sample
          </p>
          <ul className="chips" aria-labelledby="samples-label">
            {chips.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  className="chip"
                  onClick={() => (ask ? setQuestion(s.question ?? "") : setText(s.answer))}
                >
                  {s.title}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
