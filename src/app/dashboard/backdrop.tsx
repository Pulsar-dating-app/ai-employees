"use client";

import { useEffect, useRef } from "react";

// EXPERIMENTAL — a very quiet living background so the dashboard canvas
// isn't a flat white field. Three big blurred tint orbs; two of them drift
// a few pixels against the cursor (parallax layers) via a rAF lerp.
// prefers-reduced-motion keeps them perfectly still. pointer-events-none,
// sits below all content. If it reads as noise, delete this file + its
// mount in layout.tsx and nothing else changes.
export function DashboardBackdrop() {
  const layerA = useRef<HTMLDivElement>(null);
  const layerB = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const target = { x: 0, y: 0 };
    const current = { x: 0, y: 0 };
    let raf = 0;

    function onMove(e: MouseEvent) {
      target.x = e.clientX / window.innerWidth - 0.5;
      target.y = e.clientY / window.innerHeight - 0.5;
    }

    function tick() {
      current.x += (target.x - current.x) * 0.04;
      current.y += (target.y - current.y) * 0.04;
      if (layerA.current) {
        layerA.current.style.transform = `translate3d(${current.x * 40}px, ${current.y * 40}px, 0)`;
      }
      if (layerB.current) {
        layerB.current.style.transform = `translate3d(${current.x * -60}px, ${current.y * -60}px, 0)`;
      }
      raf = requestAnimationFrame(tick);
    }

    window.addEventListener("mousemove", onMove);
    raf = requestAnimationFrame(tick);
    return () => {
      window.removeEventListener("mousemove", onMove);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
      <div
        ref={layerA}
        className="absolute -left-40 -top-40 h-[38rem] w-[38rem] rounded-full bg-primary-fixed opacity-40 blur-[130px] will-change-transform"
      />
      <div
        ref={layerB}
        className="absolute -bottom-52 -right-40 h-[34rem] w-[34rem] rounded-full bg-secondary-container opacity-20 blur-[130px] will-change-transform"
      />
      <div className="absolute left-1/2 top-1/3 h-[26rem] w-[26rem] -translate-x-1/2 rounded-full bg-primary-fixed opacity-15 blur-[150px]" />
    </div>
  );
}
