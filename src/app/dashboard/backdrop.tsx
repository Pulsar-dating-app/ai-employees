"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";

// The dashboard's living background: one broad soft ribbon sweeping across
// the canvas, its edges rolling like fabric. Two SVG <path>s whose `d`
// morphs between three wave poses (a fainter echo trails the lead band);
// muted, desaturated cool fills softened with a light blur. The whole form
// also drifts a few px against the cursor.
//
// pointer-events-none, sits below all content (z-0; content is z-10 in
// layout.tsx). prefers-reduced-motion holds the first pose and drops the
// parallax. SMIL animation pauses while the tab is hidden.
//
// To remove entirely: delete this file + `<DashboardBackdrop />` in
// layout.tsx. Nothing else depends on it.

const POSES = [
  "M-100,340 C 260,220 520,460 860,360 S 1400,200 1640,320 L 1640,560 C 1400,700 1120,480 800,600 S 240,760 -100,600 Z",
  "M-100,380 C 260,520 560,300 900,420 S 1360,600 1640,440 L 1640,680 C 1360,540 1080,760 760,620 S 220,460 -100,660 Z",
  "M-100,300 C 300,400 540,180 880,320 S 1380,500 1640,360 L 1640,620 C 1380,720 1060,520 740,660 S 260,700 -100,560 Z",
];

const SPLINES = "0.4 0 0.2 1; 0.4 0 0.2 1; 0.4 0 0.2 1";
const KEYTIMES = "0; 0.33; 0.66; 1";

function subscribe(cb: () => void) {
  const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}

function usePrefersReducedMotion() {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    () => false,
  );
}

export function DashboardBackdrop() {
  const reduced = usePrefersReducedMotion();
  const svgRef = useRef<SVGSVGElement>(null);
  const parallax = useRef<HTMLDivElement>(null);

  // Pause the SMIL morph while the tab is backgrounded.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    function onVis() {
      if (document.hidden) svg?.pauseAnimations();
      else svg?.unpauseAnimations();
    }
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  // Gentle group drift against the cursor.
  useEffect(() => {
    if (reduced) return;
    const target = { x: 0, y: 0 };
    const current = { x: 0, y: 0 };
    let raf = 0;

    function onMove(e: MouseEvent) {
      target.x = e.clientX / window.innerWidth - 0.5;
      target.y = e.clientY / window.innerHeight - 0.5;
    }
    function tick() {
      current.x += (target.x - current.x) * 0.05;
      current.y += (target.y - current.y) * 0.05;
      if (parallax.current) {
        parallax.current.style.transform = `translate3d(${current.x * 34}px, ${current.y * 22}px, 0)`;
      }
      raf = requestAnimationFrame(tick);
    }
    window.addEventListener("mousemove", onMove);
    raf = requestAnimationFrame(tick);
    return () => {
      window.removeEventListener("mousemove", onMove);
      cancelAnimationFrame(raf);
    };
  }, [reduced]);

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-0 overflow-hidden"
      style={{
        background:
          "radial-gradient(70rem 50rem at 12% -15%, rgba(183,192,221,0.28), transparent 62%)," +
          "radial-gradient(60rem 46rem at 108% 60%, rgba(174,184,214,0.24), transparent 62%)",
      }}
    >
      <div ref={parallax} className="absolute inset-0 will-change-transform">
        <svg
          ref={svgRef}
          className="absolute left-1/2 top-1/2 h-[135%] w-[135%] -translate-x-1/2 -translate-y-1/2 blur-[5px]"
          viewBox="0 0 1540 900"
          preserveAspectRatio="xMidYMid slice"
        >
          <defs>
            <linearGradient id="dash-band" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#b7c0dd" stopOpacity="0" />
              <stop offset="0.5" stopColor="#c4cbe0" stopOpacity="0.85" />
              <stop offset="1" stopColor="#aeb8d6" stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* echo band, trailing and fainter */}
          <path d={POSES[1]} fill="#c8cee0" opacity="0.26" transform="translate(60 40)">
            {!reduced && (
              <animate
                attributeName="d"
                dur="30s"
                repeatCount="indefinite"
                calcMode="spline"
                keyTimes={KEYTIMES}
                keySplines={SPLINES}
                values={`${POSES[1]};${POSES[2]};${POSES[0]};${POSES[1]}`}
              />
            )}
          </path>

          {/* lead band */}
          <path d={POSES[0]} fill="url(#dash-band)">
            {!reduced && (
              <animate
                attributeName="d"
                dur="22s"
                repeatCount="indefinite"
                calcMode="spline"
                keyTimes={KEYTIMES}
                keySplines={SPLINES}
                values={`${POSES[0]};${POSES[1]};${POSES[2]};${POSES[0]}`}
              />
            )}
          </path>
        </svg>
      </div>
    </div>
  );
}
