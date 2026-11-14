import { formatDuration } from "../format";
import type { Check, ModelCall } from "../types";

type Group = { key: string; call: ModelCall; count: number };

// One entry per stage + model; the judge stage runs once per claim.
function group(calls: ModelCall[]): Group[] {
  const map = new Map<string, Group>();
  for (const call of calls) {
    const key = `${call.stage}|${call.requested}|${call.served_by}`;
    const g = map.get(key);
    if (g) g.count += 1;
    else map.set(key, { key, call, count: 1 });
  }
  return [...map.values()];
}

export function UsageStrip({ check }: { check: Check }) {
  const { usage } = check;
  const groups = group(check.model_calls);
  const tokens = (usage.prompt_tokens + usage.completion_tokens).toLocaleString("en");
  return (
    <section className="usage" aria-labelledby="usage-title">
      <div className="model-block">
        <h2 id="usage-title" className="usage-title">
          {check.mode === "mock" ? "Models, mock rules" : "Models via Bifrost gateway"}
        </h2>
        {groups.length > 0 && (
          <ul className="model-list">
            {groups.map(({ key, call, count }) => (
              <li key={key}>
                <span className="model-stage">
                  {call.stage}
                  {count > 1 && ` x${count}`}
                </span>
                <span className="model-name">{call.requested}</span>
                {call.is_fallback && <span className="fallback-tag">fallback → {call.served_by}</span>}
              </li>
            ))}
          </ul>
        )}
      </div>
      <dl className="totals">
        <div>
          <dt>Tokens</dt>
          <dd>{tokens}</dd>
        </div>
        <div>
          <dt>Searches</dt>
          <dd>{usage.search_calls}</dd>
        </div>
        {usage.cache_hits > 0 && (
          <div>
            <dt>Cache hits</dt>
            <dd>{usage.cache_hits}</dd>
          </div>
        )}
        <div>
          <dt>Duration</dt>
          <dd>{formatDuration(usage.duration_ms)}</dd>
        </div>
      </dl>
    </section>
  );
}
