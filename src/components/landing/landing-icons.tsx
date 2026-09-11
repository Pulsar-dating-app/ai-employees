// Inline-SVG replacements for the handful of Google Material Symbols the
// landing used. The Material Symbols set shipped as a render-blocking
// `<link>` to a large variable icon font on fonts.googleapis.com — a real
// LCP/CLS cost on the most SEO-important page. These 20-odd icons weigh
// nothing, ship with the HTML, and match the sizes/colours the call sites
// already pass so the layout is unchanged.
//
// Outline style (stroke, `currentColor`) approximates Material Symbols
// Outlined closely enough for the marketing page; the one place that asked
// for a filled glyph (`verified` on the featured plan) gets a filled badge.

import type { CSSProperties } from "react";

type Draw = { fill?: string; stroke?: string; body: React.ReactNode };

const S = { fill: "none", stroke: "currentColor" } as const;

const ICONS: Record<string, Draw> = {
  account_tree: {
    ...S,
    body: (
      <>
        <rect x="7" y="3" width="10" height="6" rx="1" />
        <rect x="3" y="15" width="8" height="6" rx="1" />
        <rect x="13" y="15" width="8" height="6" rx="1" />
        <path d="M12 9v3m0 0H7v3m5-3h5v3" />
      </>
    ),
  },
  arrow_forward: { ...S, body: <path d="M4 12h16m0 0-6-6m6 6-6 6" /> },
  east: { ...S, body: <path d="M4 12h16m0 0-6-6m6 6-6 6" /> },
  attach_file: {
    ...S,
    body: <path d="M18 8.5 11.4 15a3 3 0 0 1-4.2-4.2l7.3-7.3a4 4 0 0 1 5.7 5.7l-8 8a5 5 0 0 1-7-7l7-7" />,
  },
  bolt: {
    fill: "currentColor",
    stroke: "none",
    body: <path d="M13 2 4 14h6l-1 8 9-12h-6z" />,
  },
  chat_bubble: {
    ...S,
    body: <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-5.2A8 8 0 1 1 21 12Z" />,
  },
  check_circle: {
    ...S,
    body: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="m8.5 12 2.5 2.5 5-5.5" />
      </>
    ),
  },
  database: {
    ...S,
    body: (
      <>
        <ellipse cx="12" cy="5" rx="8" ry="3" />
        <path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5" />
        <path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" />
      </>
    ),
  },
  expand_more: { ...S, body: <path d="m6 9 6 6 6-6" /> },
  link: {
    ...S,
    body: (
      <>
        <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 1 0-5.7-5.7L11 7" />
        <path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 1 0 5.7 5.7L13 17" />
      </>
    ),
  },
  mail: {
    ...S,
    body: (
      <>
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path d="m4 7 8 6 8-6" />
      </>
    ),
  },
  mic: {
    ...S,
    body: (
      <>
        <rect x="9" y="3" width="6" height="11" rx="3" />
        <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
      </>
    ),
  },
  picture_as_pdf: {
    ...S,
    body: (
      <>
        <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
        <path d="M14 3v5h5" />
      </>
    ),
  },
  play_circle: {
    ...S,
    body: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M10 8.5v7l6-3.5z" fill="currentColor" stroke="none" />
      </>
    ),
  },
  public: {
    ...S,
    body: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M3 12h18M12 3c2.5 2.7 3.8 5.8 3.8 9S14.5 18.3 12 21c-2.5-2.7-3.8-5.8-3.8-9S9.5 5.7 12 3Z" />
      </>
    ),
  },
  rocket_launch: {
    ...S,
    body: (
      <>
        <path d="M14 4c3 1 6 4 7 7-2 .5-3.5 1.2-5 2.5-1.3 1.4-2 3-2.5 5-3-1-6-4-7-7 2-.5 3.6-1.2 5-2.5C13.8 7.6 14.5 6 15 4Z" />
        <path d="M9 15c-1.5 0-3 1-3.5 4C8.5 22.5 9 21 9 19.5M15 9a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z" />
      </>
    ),
  },
  send: { ...S, body: <path d="M4 4 20 12 4 20l3-8z M7 12h13" /> },
  share: {
    ...S,
    body: (
      <>
        <circle cx="6" cy="12" r="2.5" />
        <circle cx="18" cy="6" r="2.5" />
        <circle cx="18" cy="18" r="2.5" />
        <path d="m8.2 10.8 7.6-3.6M8.2 13.2l7.6 3.6" />
      </>
    ),
  },
  shopping_bag: {
    ...S,
    body: (
      <>
        <path d="M5 8h14l-1 12a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1z" />
        <path d="M9 8V6a3 3 0 0 1 6 0v2" />
      </>
    ),
  },
  table_chart: {
    ...S,
    body: (
      <>
        <rect x="3" y="4" width="18" height="16" rx="1" />
        <path d="M3 9h18M9 9v11" />
      </>
    ),
  },
  // The hand-authored 20-vertex scallop this replaced wasn't actually
  // symmetric (radii ranged ~6.2–10 with no consistent alternation), which
  // read as a squashed, lopsided blob at small sizes rather than a clean
  // seal — especially once filled solid. This is the standard Material
  // Icons "verified" glyph instead: a true rotationally-symmetric badge
  // outline with the checkmark cut as a hole in the same path
  // (`fillRule="evenodd"`), so one path serves both the outline and filled
  // variants with no separate white checkmark overlay needed.
  verified: {
    ...S,
    body: (
      <path
        fillRule="evenodd"
        d="M23 12l-2.44-2.78.34-3.68-3.61-.82-1.89-3.18L12 3 8.6 1.54 6.71 4.72l-3.61.81.34 3.68L1 12l2.44 2.78-.34 3.69 3.61.82 1.89 3.18L12 21l3.4 1.46 1.89-3.18 3.61-.82-.34-3.68L23 12zm-13 5l-4-4 1.41-1.41L10 14.17l6.59-6.59L18 9l-8 8z"
      />
    ),
  },
  verified_fill: {
    fill: "currentColor",
    stroke: "none",
    body: (
      <path
        fillRule="evenodd"
        d="M23 12l-2.44-2.78.34-3.68-3.61-.82-1.89-3.18L12 3 8.6 1.54 6.71 4.72l-3.61.81.34 3.68L1 12l2.44 2.78-.34 3.69 3.61.82 1.89 3.18L12 21l3.4 1.46 1.89-3.18 3.61-.82-.34-3.68L23 12zm-13 5l-4-4 1.41-1.41L10 14.17l6.59-6.59L18 9l-8 8z"
      />
    ),
  },
};

// Same call signature the landing's old `<M>` font-glyph component had, so
// the swap is a drop-in: `name`, plus optional `size`, `className`, `fill`.
export function M({
  name,
  className,
  size = 24,
  fill,
}: {
  name: string;
  className?: string;
  size?: number;
  fill?: boolean;
}) {
  const key = fill && ICONS[`${name}_fill`] ? `${name}_fill` : name;
  const icon = ICONS[key];
  if (!icon) return null;

  const style: CSSProperties = { width: size, height: size, flexShrink: 0 };
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      style={style}
      className={className}
      fill={icon.fill ?? "none"}
      stroke={icon.stroke ?? "currentColor"}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {icon.body}
    </svg>
  );
}
