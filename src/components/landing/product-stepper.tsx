"use client";

import { useEffect, useRef, useState } from "react";

export type StepMeta = { key: string; title: string; description: string };

const DWELL_MS = 5200;

// The page's centerpiece: one live product surface driven by a stepper.
// Advancing a step transforms the panel beside it, so the visitor watches
// the real mechanism run instead of reading four static cards about it.
//
// Auto-advances only while in view, pauses on hover/focus, and stops
// permanently once the visitor takes manual control — auto-advance that
// fights a user's click is a defect, not a feature.
export function ProductStepper({
  steps,
  panels,
}: {
  steps: StepMeta[];
  panels: React.ReactNode[];
}) {
  const [active, setActive] = useState(0);
  const [auto, setAuto] = useState(true);
  const [inView, setInView] = useState(false);
  const [reduced, setReduced] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduced(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => entries.forEach((e) => setInView(e.isIntersecting)),
      { threshold: 0.35 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const running = auto && inView && !reduced;

  useEffect(() => {
    if (!running) return;
    const id = setTimeout(() => setActive((i) => (i + 1) % steps.length), DWELL_MS);
    return () => clearTimeout(id);
  }, [running, active, steps.length]);

  function select(index: number) {
    setActive(index);
    setAuto(false);
  }

  return (
    <div
      ref={rootRef}
      className="grid grid-cols-1 items-center gap-10 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:gap-16"
      onMouseEnter={() => setAuto(false)}
    >
      <ol className="flex flex-col">
        {steps.map((step, i) => {
          const isActive = i === active;
          return (
            <li key={step.key}>
              <button
                type="button"
                onClick={() => select(i)}
                aria-current={isActive ? "step" : undefined}
                className="group relative block w-full py-4 text-left"
              >
                {/* rail */}
                <span
                  aria-hidden="true"
                  className="absolute left-0 top-0 h-full w-[2px] rounded-full bg-[var(--l-line)]"
                />
                {isActive ? (
                  <span
                    key={`${active}-${auto}`}
                    aria-hidden="true"
                    className={`absolute left-0 top-0 h-full w-[2px] rounded-full bg-[var(--l-indigo)] ${
                      running ? "l-progress" : ""
                    }`}
                    style={
                      running
                        ? { animationDuration: `${DWELL_MS}ms`, transformOrigin: "top center" }
                        : undefined
                    }
                  />
                ) : null}

                <div className="pl-6">
                  <div className="flex items-baseline gap-2.5">
                    <span
                      className={`text-[11px] font-semibold tabular-nums transition-colors duration-300 ${
                        isActive ? "text-[var(--l-indigo)]" : "text-[var(--l-faint)]"
                      }`}
                    >
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span
                      className={`text-[17px] font-semibold tracking-[-0.01em] transition-colors duration-300 ${
                        isActive ? "text-[var(--l-ink)]" : "text-[var(--l-sub)]"
                      }`}
                      style={{ fontFamily: "var(--font-landing-display)" }}
                    >
                      {step.title}
                    </span>
                  </div>
                  <p
                    className={`mt-1 max-w-[38ch] text-[13.5px] leading-relaxed transition-colors duration-300 ${
                      isActive ? "text-[var(--l-sub)]" : "text-[var(--l-faint)]"
                    }`}
                  >
                    {step.description}
                  </p>
                </div>
              </button>
            </li>
          );
        })}
      </ol>

      <div className="relative">
        {/* Keyed so the panel and its inner rows replay their entrance on
            every step change — the surface visibly rebuilding itself. */}
        <div key={active} className={reduced ? undefined : "l-panel-enter"}>
          {panels[active]}
        </div>
      </div>
    </div>
  );
}
