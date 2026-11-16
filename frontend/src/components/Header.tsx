import type { Health } from "../types";

type Props = { health: Health | null; offline: boolean };

export const REPO_URL = "https://github.com/6rzan/StaleGuard";

export function Logo() {
  return (
    <a className="brand" href="#top">
      <span className="brand-mark" aria-hidden="true">
        <svg viewBox="0 0 32 32" width="22" height="22" focusable="false">
          <path d="M16 2.5l11 4v8.2c0 7-4.6 12.2-11 14.8C9.6 26.9 5 21.7 5 14.7V6.5z" fill="currentColor" />
          <path
            d="M10.8 15.8l3.6 3.6 6.8-7.6"
            fill="none"
            stroke="var(--primary)"
            strokeWidth="2.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
      StaleGuard
    </a>
  );
}

export function Header({ health, offline }: Props) {
  const badge = offline
    ? { text: "Offline", tone: "off" }
    : !health
      ? { text: "Connecting…", tone: "off" }
      : health.mode === "mock"
        ? { text: "Mock data", tone: "mock" }
        : { text: "Live: Bifrost + Tavily", tone: "live" };

  return (
    <header className="site-nav">
      <nav className="nav-inner" aria-label="Main">
        <Logo />
        <ul className="nav-links">
          <li>
            <a href="#checker">Checker</a>
          </li>
          <li>
            <a href="#how">How it works</a>
          </li>
          <li>
            <a href="#api">API</a>
          </li>
          <li>
            <a href={REPO_URL} target="_blank" rel="noreferrer">
              GitHub
            </a>
          </li>
        </ul>
        <div className="nav-end">
          <p className={`mode-badge mode-${badge.tone}`} title={health ? `Version ${health.version}` : undefined}>
            <span className="mode-dot" aria-hidden="true" />
            {badge.text}
          </p>
          <a className="btn btn-primary btn-small" href="#checker">
            <span>
              Check<span className="nav-cta-rest"> an answer</span>
            </span>
          </a>
        </div>
      </nav>
    </header>
  );
}
