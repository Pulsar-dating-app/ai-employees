"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import clsx from "clsx";
import { useSlidingIndicator } from "@/components/ui/use-sliding-indicator";

const STEPS = ["conversations", "channels", "products", "schedule", "performance"] as const;
type StepKey = (typeof STEPS)[number];
const ADVANCE_MS = 7000;
const MOBILE_CROP: Record<StepKey, { x: number; y: number; w: number }> = {
  conversations: { x: 0.46, y: 0.2, w: 0.54 },
  channels: { x: 0.19, y: 0.08, w: 0.74 },
  products: { x: 0.19, y: 0.03, w: 0.8 },
  schedule: { x: 0.19, y: 0, w: 0.8 },
  performance: { x: 0.19, y: 0.04, w: 0.8 },
};

export function ProductTour({ locale }: { locale: "pt" | "en" }) {
  const t = useTranslations("LandingV2.tour");
  const [active, setActive] = useState<StepKey>("conversations");
  const [autoplay, setAutoplay] = useState(true);
  const [paused, setPaused] = useState(false);
  const [visible, setVisible] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const stripRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<Partial<Record<StepKey, HTMLButtonElement | null>>>({});
  const { indicatorRef, register } = useSlidingIndicator<HTMLButtonElement>(active, null, "x");

  useEffect(() => {
    const node = rootRef.current;
    if (!node) return;
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { threshold: 0.35 });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!autoplay || paused || !visible) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce), (max-width: 639px)").matches) return;
    const timer = setTimeout(() => {
      setActive((current) => STEPS[(STEPS.indexOf(current) + 1) % STEPS.length]);
    }, ADVANCE_MS);
    return () => clearTimeout(timer);
  }, [active, autoplay, paused, visible]);

  useEffect(() => {
    const strip = stripRef.current;
    const tab = tabRefs.current[active];
    if (!strip || !tab || strip.scrollWidth <= strip.clientWidth) return;
    strip.scrollTo({ left: tab.offsetLeft - strip.clientWidth / 2 + tab.offsetWidth / 2, behavior: "smooth" });
  }, [active]);

  function choose(step: StepKey) {
    setAutoplay(false);
    setActive(step);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const dir = e.key === "ArrowRight" ? 1 : -1;
    const next = STEPS[(STEPS.indexOf(active) + dir + STEPS.length) % STEPS.length];
    choose(next);
    tabRefs.current[next]?.focus();
  }

  return (
    <div
      ref={rootRef}
      className="flex flex-col gap-6"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
      onPointerDown={(e) => {
        if (e.pointerType !== "mouse") setAutoplay(false);
      }}
    >
      <div
        ref={stripRef}
        className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:mx-0 sm:px-0"
      >
        <div
          role="tablist"
          aria-label={t("tablistLabel")}
          onKeyDown={onKeyDown}
          className="relative mx-auto flex w-max gap-1 rounded-full bg-white p-1 shadow-[0_4px_24px_rgba(79,70,229,0.1)]"
        >
          <span
            ref={indicatorRef}
            aria-hidden="true"
            className="inbox-indicator absolute left-0 rounded-full bg-[#3525cd] opacity-0 shadow-[0_6px_16px_-6px_rgba(53,37,205,0.6)]"
          />
          {STEPS.map((step, i) => {
            const selected = active === step;
            return (
              <button
                key={step}
                ref={(el) => {
                  register(step)(el);
                  tabRefs.current[step] = el;
                }}
                type="button"
                role="tab"
                id={`tour-tab-${step}`}
                aria-selected={selected}
                aria-controls="tour-panel"
                tabIndex={selected ? 0 : -1}
                onClick={() => choose(step)}
                className={clsx(
                  "relative z-10 inline-flex h-10 shrink-0 items-center gap-2 whitespace-nowrap rounded-full px-4 text-[14px] font-semibold transition-colors duration-200",
                  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3525cd]",
                  selected ? "text-white" : "text-[#464555] hover:text-[#0f172a]",
                )}
              >
                <span
                  className={clsx(
                    "flex h-5 w-5 items-center justify-center rounded-full text-[11px] tabular-nums",
                    selected ? "bg-white/20" : "bg-[#eae6f4]",
                  )}
                >
                  {i + 1}
                </span>
                {t(`steps.${step}.tab`)}
              </button>
            );
          })}
        </div>
      </div>

      <div
        id="tour-panel"
        role="tabpanel"
        aria-labelledby={`tour-tab-${active}`}
        className="grid grid-cols-1 items-center gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,2.6fr)] lg:gap-10"
      >
        <div key={active} className="inbox-pane-in flex flex-col gap-3 text-center lg:text-left">
          <h3 className="text-balance text-[22px] font-semibold leading-[28px] tracking-[-0.01em] text-[#0f172a] sm:text-[26px] sm:leading-[32px]">
            {t(`steps.${active}.title`)}
          </h3>
          <p className="mx-auto max-w-md text-[15px] leading-6 text-[#464555] lg:mx-0">{t(`steps.${active}.body`)}</p>
        </div>

        <figure className="overflow-hidden rounded-[20px] bg-white shadow-[0_1px_2px_rgba(15,23,42,0.06),0_40px_80px_-40px_rgba(53,37,205,0.45)] ring-1 ring-[#e7e3f7]">
          <div
            className="flex items-center gap-1.5 border-b border-[#efecf8] bg-[#faf9fe] px-4 py-2.5"
            aria-hidden="true"
          >
            <span className="h-2.5 w-2.5 rounded-full bg-[#e5e1f3]" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#e5e1f3]" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#e5e1f3]" />
          </div>
          <div className="relative aspect-[4/3] overflow-hidden bg-[#f7f8fa] sm:aspect-[16/10]">
            {STEPS.map((step) => {
              const crop = MOBILE_CROP[step];
              return (
                <Image
                  key={step}
                  src={`/landing-v2/tour/${locale}/${step}.webp`}
                  alt={t(`steps.${step}.alt`)}
                  width={1920}
                  height={1200}
                  sizes="(min-width: 1024px) 900px, (min-width: 640px) 100vw, 190vw"
                  className={clsx(
                    "absolute left-0 top-0 h-auto max-w-none translate-x-[var(--crop-x)] translate-y-[var(--crop-y)] w-[var(--crop-w)] transition-opacity duration-500 sm:w-full sm:translate-x-0 sm:translate-y-0",
                    step === active ? "opacity-100" : "opacity-0",
                  )}
                  style={
                    {
                      "--crop-x": `${-crop.x * 100}%`,
                      "--crop-y": `${-crop.y * 100}%`,
                      "--crop-w": `${100 / crop.w}%`,
                    } as React.CSSProperties
                  }
                  aria-hidden={step !== active}
                />
              );
            })}
          </div>
          <figcaption className="border-t border-[#efecf8] bg-[#faf9fe] px-4 py-2 text-[12px] text-[#64748b]">
            {t("sampleNote")}
          </figcaption>
        </figure>
      </div>
    </div>
  );
}
