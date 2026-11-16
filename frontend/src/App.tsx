import { useCallback, useEffect, useRef, useState } from "react";
import { getHealth, getSamples } from "./api";
import { Header } from "./components/Header";
import { History } from "./components/History";
import { InputCard } from "./components/InputCard";
import { ClosingCta, Features, Footer, Hero, HowItWorks, Integrations } from "./components/Landing";
import { Result } from "./components/Result";
import { EmptyState, ErrorNotice } from "./components/States";
import { loadOwnChecks } from "./history";
import type { CheckSummary, Health, Sample } from "./types";
import { useCheck } from "./useCheck";

// ?demo=1 shows one hand-written finished check, for UI work without a backend.
const DEMO = new URLSearchParams(window.location.search).get("demo") === "1";

export default function App() {
  const [health, setHealth] = useState<Health | null>(null);
  const [samples, setSamples] = useState<Sample[]>([]);
  const [offline, setOffline] = useState(false);
  const [history, setHistory] = useState<CheckSummary[] | null>(null);
  const [historyFailed, setHistoryFailed] = useState(false);
  const resultRef = useRef<HTMLDivElement>(null);

  const loadHistory = useCallback(() => {
    loadOwnChecks()
      .then((items) => {
        setHistory(items);
        setHistoryFailed(false);
      })
      .catch(() => setHistoryFailed(true));
  }, []);

  const { check, running, error, canRetry, submit, open, retry, show } = useCheck(loadHistory);

  const bootstrap = useCallback(() => {
    Promise.all([getHealth(), getSamples()])
      .then(([h, s]) => {
        setOffline(false);
        setHealth(h);
        setSamples(s);
      })
      .catch(() => setOffline(true));
    loadHistory();
  }, [loadHistory]);

  useEffect(bootstrap, [bootstrap]);

  useEffect(() => {
    if (!DEMO) return;
    void import("./dev/sampleCheck").then((m) => show(m.sampleCheck));
  }, [show]);

  // On phones the report renders below the fold; bring it into view.
  const checkId = check?.id;
  useEffect(() => {
    if (checkId && window.matchMedia("(max-width: 720px)").matches) {
      resultRef.current?.scrollIntoView({ block: "start" });
    }
  }, [checkId]);

  return (
    <>
      <a className="skip-link" href="#checker">
        Skip to the checker
      </a>
      <Header health={health} offline={offline} />
      <main id="top">
        <Hero />
        <section id="checker" className="band band-alt checker" aria-labelledby="checker-title">
          <div className="container">
            <header className="section-head section-head-left">
              <h2 id="checker-title">
                Run a <span className="accent">freshness check</span>
              </h2>
              <p className="lead">
                Paste a model answer or ask a question. Claims light up as they are verified, each with its sources.
              </p>
            </header>
            {offline && !DEMO && (
              <ErrorNotice
                title="Cannot reach the StaleGuard API"
                message="The backend does not answer on /api. Start it on port 8000, then retry."
                onRetry={bootstrap}
              />
            )}
            <div className="layout">
              <div id="main" className="main">
                <InputCard samples={samples} running={running} onSubmit={(req) => void submit(req)} />
                <div ref={resultRef} className="result-slot">
                  {error && <ErrorNotice title="Something went wrong" message={error} onRetry={canRetry ? retry : null} />}
                  {check ? (
                    <Result key={check.id} check={check} />
                  ) : running ? (
                    <section className="card loading" role="status">
                      <span className="spinner" aria-hidden="true" />
                      Starting the check…
                    </section>
                  ) : (
                    !error && <EmptyState hasSamples={samples.length > 0} />
                  )}
                </div>
              </div>
              <History items={history} failed={historyFailed} currentId={check?.id ?? null} onOpen={open} />
            </div>
          </div>
        </section>
        <Features />
        <HowItWorks />
        <Integrations />
        <ClosingCta />
      </main>
      <Footer />
    </>
  );
}
