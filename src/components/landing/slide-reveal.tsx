"use client";

import { useEffect, useState, type CSSProperties, type ReactNode } from "react";

// Hero showcase card entrance: the left (chat) and right (workspace) halves
// fade + slide in from their own side once on page load, slowly — the same
// load moment as the headline's own ShutterReveal, not a second competing
// one. Same safety pattern as shutter-reveal.tsx: the default (unclassed)
// state carries no transform/opacity override, so a no-JS or pre-hydration
// render shows the card exactly as already shipped; only a confirmed-safe,
// rAF-deferred effect adds `.lv2-slide-play`, which reveals the keyframe's
// own hidden 0% state via `animation-fill-mode: backwards`.
export function SlideReveal({
  children,
  from,
  delayMs = 0,
  className = "",
}: {
  children: ReactNode;
  from: "left" | "right";
  delayMs?: number;
  className?: string;
}) {
  const [play, setPlay] = useState(false);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = requestAnimationFrame(() => setPlay(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const style = {
    "--lv2-slide-from": from === "left" ? "-56px" : "56px",
    "--lv2-slide-delay": `${delayMs}ms`,
  } as CSSProperties;

  return (
    <div style={style} className={["lv2-slide", play && "lv2-slide-play", className].filter(Boolean).join(" ")}>
      {children}
    </div>
  );
}
