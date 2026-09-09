"use client";

import { useEffect, useState, type ReactNode } from "react";

// Adapted from a linked "hero shutter text" reference component: on page
// load, three brand-gradient bands sweep once across the hero's
// already-gradiented highlight phrase while it blurs into focus — a
// one-time focal entrance, not a per-character glitch across the whole
// headline (too many characters, too busy for a marketing sentence) and
// not the reference's dark zinc/emerald palette (this page never leaves
// its light Stitch surface). The wrapped child is the page's existing
// bg-clip-text gradient span, untouched, so with JS disabled or before
// hydration it renders exactly as shipped — the entrance is purely
// additive chrome, armed and played only once motion is confirmed safe.
export function ShutterReveal({ children, className = "" }: { children: ReactNode; className?: string }) {
  const [play, setPlay] = useState(false);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = requestAnimationFrame(() => setPlay(true));
    return () => cancelAnimationFrame(id);
  }, []);

  return (
    <span
      className={["lv2-shutter relative inline-block", play && "lv2-shutter-play", className]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
      <span aria-hidden className="lv2-shutter-bands">
        <span className="lv2-shutter-band lv2-shutter-band-1" />
        <span className="lv2-shutter-band lv2-shutter-band-2" />
        <span className="lv2-shutter-band lv2-shutter-band-3" />
      </span>
    </span>
  );
}
