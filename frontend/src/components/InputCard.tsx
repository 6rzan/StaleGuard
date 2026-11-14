import { useState } from "react";
import { MAX_ANSWER } from "../format";
import type { Sample } from "../types";

type Props = {
  samples: Sample[];
  running: boolean;
  onSubmit: (answer: string) => void;
};

export function InputCard({ samples, running, onSubmit }: Props) {
  const [text, setText] = useState("");
  const empty = text.trim().length === 0;

  return (
    <section className="card input-card" aria-labelledby="input-title">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!empty && !running) onSubmit(text);
        }}
      >
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
        <div className="input-foot">
          <p id="answer-count" className="counter">
            {text.length.toLocaleString("en")} / {MAX_ANSWER.toLocaleString("en")}
          </p>
          <button type="submit" className="btn btn-primary" disabled={empty || running}>
            {running ? "Checking…" : "Check freshness"}
          </button>
        </div>
      </form>
      {samples.length > 0 && (
        <div className="samples">
          <p className="samples-label" id="samples-label">
            Or try a sample
          </p>
          <ul className="chips" aria-labelledby="samples-label">
            {samples.map((s) => (
              <li key={s.id}>
                <button type="button" className="chip" onClick={() => setText(s.answer)}>
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
