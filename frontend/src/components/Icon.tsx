import type { ReactNode } from "react";

export type IconName =
  | "fresh"
  | "review"
  | "stale"
  | "unverified"
  | "skipped"
  | "supports"
  | "contradicts"
  | "neutral";

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
