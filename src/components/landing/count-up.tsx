"use client";

import { useEffect, useRef, useState } from "react";

export type CountUpProps = {
  value: number;
  decimals?: number;
  suffix?: string;
  duration?: number;
  className?: string;
};

function easeOutExpo(t: number) {
  return t >= 1 ? 1 : 1 - Math.pow(2, -10 * t);
}

// Counts up once, from 0 to `value`, the moment the element scrolls into
// view — the impact-stats band's one signature "wow" beat (see
// architecture.md). Renders the resting value immediately under
// prefers-reduced-motion or before hydration, so there is never a flash of
// "0" for users who never trigger the animation.
export function CountUp({ value, decimals = 0, suffix = "", duration = 1400, className }: CountUpProps) {
  const spanRef = useRef<HTMLSpanElement>(null);
  const [display, setDisplay] = useState(value);

  useEffect(() => {
    const motionOk = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!motionOk) return;

    const el = spanRef.current;
    if (!el) return;

    setDisplay(0);

    let frame = 0;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        observer.disconnect();

        const start = performance.now();
        const tick = (now: number) => {
          const t = Math.min(1, (now - start) / duration);
          setDisplay(value * easeOutExpo(t));
          if (t < 1) frame = requestAnimationFrame(tick);
        };
        frame = requestAnimationFrame(tick);
      },
      { threshold: 0.4 },
    );
    observer.observe(el);

    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [value, duration]);

  return (
    <span ref={spanRef} className={className}>
      {display.toFixed(decimals)}
      {suffix}
    </span>
  );
}
