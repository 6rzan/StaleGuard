import type { Health } from "../types";

type Props = { health: Health | null; offline: boolean };

export function Header({ health, offline }: Props) {
  const badge = offline
    ? { text: "Offline", tone: "off" }
    : !health
      ? { text: "Connecting…", tone: "off" }
      : health.mode === "mock"
        ? { text: "Mock data", tone: "mock" }
        : { text: "Live: Bifrost + Tavily", tone: "live" };

  return (
    <header className="site-header">
      <div className="brand">
        <svg className="brand-mark" viewBox="0 0 32 32" width="30" height="30" aria-hidden="true" focusable="false">
          <path d="M16 2.5l11 4v8.2c0 7-4.6 12.2-11 14.8C9.6 26.9 5 21.7 5 14.7V6.5z" fill="currentColor" />
          <path
            d="M10.8 15.8l3.6 3.6 6.8-7.6"
            fill="none"
            stroke="var(--card)"
            strokeWidth="2.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <div>
          <h1>StaleGuard</h1>
          <p className="tagline">Freshness check for AI answers</p>
        </div>
      </div>
      <p className={`mode-badge mode-${badge.tone}`} title={health ? `Version ${health.version}` : undefined}>
        <span className="mode-dot" aria-hidden="true" />
        {badge.text}
      </p>
    </header>
  );
}
