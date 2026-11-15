import { useEffect, useRef, useState } from "react";
import { Logo, REPO_URL } from "./Header";
import { Icon, type IconName } from "./Icon";

const COMMAND = "docker compose up";

function CopyCommand() {
  const [copy, setCopy] = useState<"idle" | "done" | "failed">("idle");
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  async function onCopy() {
    try {
      await navigator.clipboard.writeText(COMMAND);
      setCopy("done");
    } catch {
      setCopy("failed");
    }
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCopy("idle"), 2000);
  }

  return (
    <div className="terminal-wrap">
      <div className="terminal">
        <code>
          <span className="prompt" aria-hidden="true">
            $
          </span>{" "}
          {COMMAND}
        </code>
        <button type="button" className="icon-btn" aria-label="Copy the command" onClick={() => void onCopy()}>
          <Icon name={copy === "done" ? "supports" : "copy"} />
        </button>
      </div>
      <p className="copy-note" role="status" data-failed={copy === "failed"}>
        {copy === "done" && "Copied to the clipboard."}
        {copy === "failed" && "Copy failed. Select the command and copy it by hand."}
      </p>
    </div>
  );
}

export function Hero() {
  return (
    <section className="hero" aria-labelledby="hero-title">
      <div className="container hero-inner">
        <p className="version-pill">
          <span className="mode-dot" aria-hidden="true" />
          v0.2.0 · Tavily + Bifrost
        </p>
        <h1 id="hero-title">
          Catch stale facts
          <span className="accent"> in AI answers</span>
        </h1>
        <p className="hero-sub">
          StaleGuard finds the time-sensitive claims in an LLM answer, re-checks each one against the live web and scores
          how fresh it is.
        </p>
        <div className="cta-row">
          <a className="btn btn-primary" href="#checker">
            Check an answer
            <Icon name="arrow" />
          </a>
          <a className="btn btn-secondary" href="#api">
            Read the API
          </a>
        </div>
        <CopyCommand />
        <dl className="stats">
          <div>
            <dt>PS06 requirements covered</dt>
            <dd>4</dd>
          </div>
          <div>
            <dt>freshness score per claim</dt>
            <dd>0–100</dd>
          </div>
          <div>
            <dt>backend tests</dt>
            <dd>84</dd>
          </div>
        </dl>
      </div>
    </section>
  );
}

const FEATURES: { icon: IconName; title: string; text: string }[] = [
  {
    icon: "extract",
    title: "Claim extraction",
    text: "A model returns every factual claim as an exact piece of the answer, with a category.",
  },
  {
    icon: "clock",
    title: "Freshness detection",
    text: "Each claim is marked time-sensitive or timeless, with a volatility level and a one-line reason.",
  },
  {
    icon: "search",
    title: "Live verification (Tavily)",
    text: "Tavily searches the web for each flagged claim and returns dated sources for the verdict.",
  },
  {
    icon: "score",
    title: "Deterministic scoring",
    text: "A fixed formula turns verdict, confidence, recency and agreement into a 0–100 score.",
  },
  {
    icon: "ask",
    title: "Ask mode",
    text: "Type a question, a model answers it through Bifrost, then the answer is checked.",
  },
  {
    icon: "edit",
    title: "Corrected answer",
    text: "Outdated statements are rewritten with current values, with a word diff against the original.",
  },
];

export function Features() {
  return (
    <section className="band band-alt" aria-labelledby="features-title">
      <div className="container">
        <header className="section-head">
          <p className="eyebrow">Features</p>
          <h2 id="features-title">
            Every claim, checked <span className="accent">against the live web</span>
          </h2>
        </header>
        <ul className="feature-grid">
          {FEATURES.map((f) => (
            <li key={f.title} className="feature">
              <span className="icon-tile" aria-hidden="true">
                <Icon name={f.icon} />
              </span>
              <h3>{f.title}</h3>
              <p>{f.text}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

const STEPS = [
  "Extract: a model behind Bifrost lists the claims in the answer.",
  "Search: one Tavily search per time-sensitive claim.",
  "Judge: a model behind Bifrost weighs each claim against its sources.",
  "Score: plain code, no model. Same inputs, same score.",
];

// [token class, text] per line; the class colours the token, null is plain text.
const CODE: [string | null, string][][] = [
  [["fn", "curl"], [null, " -s -X POST "], ["str", "'http://localhost:8000/api/checks?wait=true'"], [null, " \\"]],
  [[null, "  -H "], ["str", "'Content-Type: application/json'"], [null, " \\"]],
  [[null, "  -d "], ["str", `'{"answer": "The Pro plan costs $20 per month per user."}'`]],
  [],
  [["com", "# trimmed response, mock mode"]],
  [[null, "{"]],
  [[null, "  "], ["key", '"status"'], [null, ": "], ["str", '"done"'], [null, ","]],
  [[null, "  "], ["key", '"overall_score"'], [null, ": "], ["num", "10"], [null, ","]],
  [[null, "  "], ["key", '"claims"'], [null, ": [{"]],
  [[null, "    "], ["key", '"verdict"'], [null, ": "], ["str", '"outdated"'], [null, ","]],
  [[null, "    "], ["key", '"freshness_score"'], [null, ": "], ["num", "10"], [null, ","]],
  [[null, "    "], ["key", '"label"'], [null, ": "], ["str", '"stale"'], [null, ","]],
  [[null, "    "], ["key", '"current_value"'], [null, ": "], ["str", '"$25 per user per month since September 2026"']],
  [[null, "  }]"]],
  [[null, "}"]],
];

export function HowItWorks() {
  return (
    <section id="how" className="band" aria-labelledby="how-title">
      <div className="container split">
        <div>
          <p className="eyebrow">How it works</p>
          <h2 id="how-title">
            From answer <span className="accent">to evidence</span>
          </h2>
          <p className="lead">
            Every check runs the same pipeline. Other apps can call it too: one request with{" "}
            <code>?wait=true</code> returns the finished report as JSON.
          </p>
          <ul className="steps">
            {STEPS.map((s) => (
              <li key={s}>
                <Icon name="supports" />
                {s}
              </li>
            ))}
          </ul>
        </div>
        <figure id="api" className="code-window" aria-labelledby="api-caption">
          <figcaption className="code-head">
            <span className="dots" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
            <span id="api-caption">check.sh</span>
          </figcaption>
          <pre tabIndex={0}>
            <code>
              {CODE.map((line, i) => (
                <span key={i}>
                  {line.map(([tone, text], j) => (tone ? <span key={j} className={`t-${tone}`}>{text}</span> : text))}
                  {"\n"}
                </span>
              ))}
            </code>
          </pre>
        </figure>
      </div>
    </section>
  );
}

const STACK: { mark: string; name: string; role: string }[] = [
  { mark: "TV", name: "Tavily", role: "Live web search" },
  { mark: "BF", name: "Bifrost", role: "LLM gateway, failover" },
  { mark: "GQ", name: "Groq", role: "Hosts gpt-oss for every stage" },
  { mark: "OSS", name: "gpt-oss", role: "Open-weight 120b, 20b as fallback" },
  { mark: "FA", name: "FastAPI", role: "Backend API" },
  { mark: "RE", name: "React", role: "This interface" },
  { mark: "SQL", name: "SQLite", role: "History and claim cache" },
  { mark: "DK", name: "Docker", role: "One-command run" },
];

export function Integrations() {
  return (
    <section className="band band-alt" aria-labelledby="stack-title">
      <div className="container">
        <header className="section-head">
          <p className="eyebrow">Integrations</p>
          <h2 id="stack-title">
            Built on <span className="accent">Tavily and Bifrost</span>
          </h2>
          <p className="lead">Every live search goes through Tavily. Every model call goes through Bifrost.</p>
        </header>
        <ul className="stack-grid">
          {STACK.map((s) => (
            <li key={s.name} className="stack-tile">
              <span className="stack-mark" aria-hidden="true">
                {s.mark}
              </span>
              <span className="stack-name">{s.name}</span>
              <span className="stack-role">{s.role}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export function ClosingCta() {
  return (
    <section className="band" aria-labelledby="cta-title">
      <div className="container">
        <div className="cta-box">
          <h2 id="cta-title">
            Ready to check <span className="accent">your answers</span>?
          </h2>
          <p className="lead">Paste any model reply and see which facts no longer hold, with the sources to prove it.</p>
          <div className="cta-row">
            <a className="btn btn-primary" href="#checker">
              Check an answer
              <Icon name="arrow" />
            </a>
            <a className="btn btn-secondary" href="#api">
              Read the API
            </a>
          </div>
          <ul className="trust">
            {["Open source, MIT", "Runs without keys in mock mode", "One command with Docker"].map((t) => (
              <li key={t}>
                <Icon name="supports" />
                {t}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

export function Footer() {
  return (
    <footer className="site-footer">
      <div className="container footer-grid">
        <div className="footer-brand">
          <Logo />
          <p>Freshness check for AI answers.</p>
        </div>
        <nav aria-labelledby="f-product">
          <h2 id="f-product">Product</h2>
          <ul>
            <li>
              <a href="#checker">Checker</a>
            </li>
            <li>
              <a href="#how">How it works</a>
            </li>
            <li>
              <a href="#api">API</a>
            </li>
          </ul>
        </nav>
        <nav aria-labelledby="f-project">
          <h2 id="f-project">Project</h2>
          <ul>
            <li>
              <a href={REPO_URL} target="_blank" rel="noreferrer">
                GitHub
              </a>
            </li>
            <li>
              <a href={`${REPO_URL}#readme`} target="_blank" rel="noreferrer">
                README
              </a>
            </li>
            <li>
              <a href={`${REPO_URL}/blob/main/LICENSE`} target="_blank" rel="noreferrer">
                License
              </a>
            </li>
          </ul>
        </nav>
        <div>
          <h2>Hackathon</h2>
          <ul>
            <li>Global AI Hackathon 2026</li>
            <li>PS06 Tavily + Bifrost</li>
          </ul>
        </div>
      </div>
      <div className="container footer-bottom">
        <p>© 2026 StaleGuard contributors · MIT</p>
      </div>
    </footer>
  );
}
