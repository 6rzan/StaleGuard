import type { ReactNode } from "react";

export type IconName =
  | "fresh"
  | "review"
  | "stale"
  | "unverified"
  | "skipped"
  | "supports"
  | "contradicts"
  | "neutral"
  | "extract"
  | "clock"
  | "search"
  | "score"
  | "ask"
  | "edit"
  | "copy"
  | "arrow";

const PATHS: Record<IconName, ReactNode> = {
  fresh: (
    <>
      <circle cx="8" cy="8" r="6.25" />
      <path d="M5.2 8.2l2 2 3.6-4" />
    </>
  ),
  review: (
    <>
      <path d="M8 2.2l6 10.6H2z" />
      <path d="M8 6.6v2.9M8 11.4v.1" />
    </>
  ),
  stale: (
    <>
      <circle cx="8" cy="8" r="6.25" />
      <path d="M5.8 5.8l4.4 4.4M10.2 5.8l-4.4 4.4" />
    </>
  ),
  unverified: (
    <>
      <circle cx="8" cy="8" r="6.25" />
      <path d="M6.2 6.4a1.9 1.9 0 1 1 2.6 1.7c-.5.3-.8.6-.8 1.2M8 11.4v.1" />
    </>
  ),
  skipped: (
    <>
      <circle cx="8" cy="8" r="6.25" />
      <path d="M5.5 8h5" />
    </>
  ),
  supports: <path d="M3.5 8.5l3 3 6-6.5" />,
  contradicts: <path d="M4 4l8 8M12 4l-8 8" />,
  neutral: <path d="M4 8h8" />,
  extract: (
    <>
      <path d="M5 2.75H3.25v10.5H5M11 2.75h1.75v10.5H11" />
      <path d="M6.25 6.25h3.5M6.25 9.75h3.5" />
    </>
  ),
  clock: (
    <>
      <circle cx="8" cy="8" r="6.25" />
      <path d="M8 4.75V8l2.25 1.5" />
    </>
  ),
  search: (
    <>
      <circle cx="7" cy="7" r="4.25" />
      <path d="M10.2 10.2l3.3 3.3" />
    </>
  ),
  score: <path d="M2.75 13.25h10.5M4.5 13.25V9.5M8 13.25V5.5M11.5 13.25V3" />,
  ask: <path d="M2.75 3.25h10.5v7.25H7.25L4.5 12.75V10.5H2.75z" />,
  edit: (
    <>
      <path d="M10.5 2.75l2.75 2.75-7.5 7.5H3v-2.75z" />
      <path d="M9 4.25L11.75 7" />
    </>
  ),
  copy: (
    <>
      <rect x="5.5" y="5.5" width="8" height="8" rx="1.5" />
      <path d="M10.5 5.5V4a1.25 1.25 0 0 0-1.25-1.25H4A1.25 1.25 0 0 0 2.75 4v5.25A1.25 1.25 0 0 0 4 10.5h1.5" />
    </>
  ),
  arrow: <path d="M3 8h10M9 4l4 4-4 4" />,
};

export function Icon({ name }: { name: IconName }) {
  return (
    <svg
      className="icon"
      viewBox="0 0 16 16"
      width="1em"
      height="1em"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {PATHS[name]}
    </svg>
  );
}
