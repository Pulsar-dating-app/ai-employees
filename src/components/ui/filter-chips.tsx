"use client";

import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { ChevronLeftIcon, ChevronRightIcon } from "@/components/ui/icons";
import { useSlidingIndicator } from "@/components/ui/use-sliding-indicator";

const FADE = 40;

export function FilterChips({
  keys,
  value,
  onChange,
  labelFor,
  label,
}: {
  keys: string[];
  value: string;
  onChange: (value: string) => void;
  labelFor: (key: string) => string;
  label?: string;
}) {
  const { indicatorRef, register } = useSlidingIndicator<HTMLButtonElement>(value, keys.join("|"), "x");
  const stripRef = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ start: false, end: false });

  useEffect(() => {
    const strip = stripRef.current;
    if (!strip) return;
    function measure() {
      if (!strip) return;
      const start = strip.scrollLeft > 2;
      const end = strip.scrollLeft + strip.clientWidth < strip.scrollWidth - 2;
      setEdges((prev) => (prev.start === start && prev.end === end ? prev : { start, end }));
    }
    const observer = new ResizeObserver(measure);
    observer.observe(strip);
    strip.addEventListener("scroll", measure, { passive: true });
    return () => {
      observer.disconnect();
      strip.removeEventListener("scroll", measure);
    };
  }, [keys.length]);

  useEffect(() => {
    const strip = stripRef.current;
    const chip = strip?.querySelector<HTMLElement>(`[data-chip-key="${CSS.escape(value)}"]`);
    if (!strip || !chip) return;
    const left = chip.offsetLeft - FADE;
    const right = chip.offsetLeft + chip.offsetWidth + FADE;
    if (left < strip.scrollLeft) strip.scrollTo({ left, behavior: "smooth" });
    else if (right > strip.scrollLeft + strip.clientWidth)
      strip.scrollTo({ left: right - strip.clientWidth, behavior: "smooth" });
  }, [value]);

  function nudge(direction: 1 | -1) {
    const strip = stripRef.current;
    if (!strip) return;
    strip.scrollBy({ left: direction * strip.clientWidth * 0.7, behavior: "smooth" });
  }

  const mask = `linear-gradient(to right, ${edges.start ? "transparent" : "#000"} 0, #000 ${
    edges.start ? FADE : 0
  }px, #000 calc(100% - ${edges.end ? FADE : 0}px), ${edges.end ? "transparent" : "#000"} 100%)`;

  return (
    <div className="relative min-w-0 max-w-full rounded-full bg-surface-container">
      <div
        ref={stripRef}
        role="group"
        aria-label={label}
        style={{ maskImage: mask, WebkitMaskImage: mask }}
        className="relative flex gap-1 overflow-x-auto p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        <span
          ref={indicatorRef}
          aria-hidden="true"
          className="inbox-indicator absolute left-0 rounded-full bg-surface-container-lowest opacity-0 shadow-[0_1px_3px_rgba(25,28,29,0.14)]"
        />
        {keys.map((key) => (
          <button
            key={key}
            ref={register(key)}
            data-chip-key={key}
            type="button"
            aria-pressed={value === key}
            onClick={() => onChange(key)}
            className={clsx(
              "relative z-10 inline-flex h-8 shrink-0 items-center whitespace-nowrap rounded-full px-3.5 text-label-md font-semibold transition-colors duration-200",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
              value === key ? "text-on-surface" : "text-on-surface-variant hover:text-on-surface",
            )}
          >
            {labelFor(key)}
          </button>
        ))}
      </div>
      {edges.start ? (
        <button
          type="button"
          tabIndex={-1}
          aria-hidden="true"
          onClick={() => nudge(-1)}
          className="absolute left-1 top-1/2 z-20 hidden h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full bg-surface-container-lowest text-on-surface-variant shadow-[0_1px_3px_rgba(25,28,29,0.18)] transition-colors hover:text-on-surface md:flex"
        >
          <ChevronLeftIcon className="h-3.5 w-3.5" />
        </button>
      ) : null}
      {edges.end ? (
        <button
          type="button"
          tabIndex={-1}
          aria-hidden="true"
          onClick={() => nudge(1)}
          className="absolute right-1 top-1/2 z-20 hidden h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full bg-surface-container-lowest text-on-surface-variant shadow-[0_1px_3px_rgba(25,28,29,0.18)] transition-colors hover:text-on-surface md:flex"
        >
          <ChevronRightIcon className="h-3.5 w-3.5" />
        </button>
      ) : null}
    </div>
  );
}
