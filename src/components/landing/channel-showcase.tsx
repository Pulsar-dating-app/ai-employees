"use client";

import { useEffect, useState } from "react";
import Image, { type StaticImageData } from "next/image";
import { useTranslations } from "next-intl";
import { BrandLogo } from "./brand-logos";
import maluImg from "../../../public/agents/sales-1.png";
import anaImg from "../../../public/agents/secretary-1.png";

export type ChannelItem = {
  key: string;
  // BrandLogo name: "WhatsApp" | "Instagram" | "Telegram" | "Site" | "Chat"
  brand: string;
  name: string;
  headline: string;
  caption: string;
  points: string[];
};

// Accent used for the channel label, badge and check marks — nudged darker
// for green/blue so it reads on the light panel.
const ACCENT: Record<string, string> = {
  WhatsApp: "#1FA855",
  Instagram: "#C13584",
  Telegram: "#1D8FC7",
  Site: "#3525cd",
  Chat: "#3525cd",
};

// The real roster — Malu and Ana — shown on every card as an overlapped
// pair. Both work every channel (the agent is channel-agnostic), so no
// per-channel role is implied; the same two just answer wherever the
// customer writes.
const TEAM: StaticImageData[] = [maluImg, anaImg];

// Soft smoky wash behind the panel content, tinted per channel (Instagram
// gets its multi-stop gradient). Low-opacity radials over a white panel, so
// dark text stays readable.
const HAZE: Record<string, string> = {
  WhatsApp:
    "radial-gradient(65% 85% at 95% -5%, rgba(37,211,102,0.55), transparent 66%), radial-gradient(60% 75% at -5% 105%, rgba(37,211,102,0.3), transparent 66%)",
  Instagram:
    "radial-gradient(58% 78% at 98% 0%, rgba(247,119,55,0.58), transparent 62%), radial-gradient(58% 78% at 2% 100%, rgba(193,53,132,0.48), transparent 62%), radial-gradient(66% 70% at 55% 120%, rgba(120,52,175,0.4), transparent 68%)",
  Telegram:
    "radial-gradient(65% 85% at 95% -5%, rgba(41,169,235,0.55), transparent 66%), radial-gradient(60% 75% at -5% 105%, rgba(41,169,235,0.3), transparent 66%)",
  Site:
    "radial-gradient(65% 85% at 95% -5%, rgba(79,70,229,0.5), transparent 66%), radial-gradient(60% 75% at -5% 105%, rgba(53,37,205,0.3), transparent 66%)",
  Chat:
    "radial-gradient(65% 85% at 95% -5%, rgba(79,70,229,0.5), transparent 66%), radial-gradient(60% 75% at -5% 105%, rgba(53,37,205,0.3), transparent 66%)",
};

const CYCLE_MS = 5000;

// Auto-rotating channel selector: a floating brand-logo pill row above a
// light showcase panel that swaps per channel — a per-channel smoky
// gradient wash, headline, blurb, points, a CTA, and the agent portrait
// with the channel mark badged onto it.
export function ChannelShowcase({ items, hireHref }: { items: ChannelItem[]; hireHref: string }) {
  const t = useTranslations("LandingV2.channels");
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const [motionOk, setMotionOk] = useState(
    () =>
      typeof window === "undefined" ||
      !window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const on = () => setMotionOk(!mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);

  useEffect(() => {
    if (!motionOk || paused || items.length < 2) return;
    const id = setTimeout(() => setActive((i) => (i + 1) % items.length), CYCLE_MS);
    return () => clearTimeout(id);
  }, [active, paused, motionOk, items.length]);

  const current = items[active];
  const accent = ACCENT[current.brand] ?? "#3525cd";

  return (
    <div
      className="mx-auto max-w-4xl"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <style>{`@keyframes ls-channel-fade{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}`}</style>

      {/* Floating pill row */}
      <div
        role="tablist"
        aria-label={t("tablistLabel")}
        className="flex justify-start gap-1 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] sm:justify-center sm:gap-2 [&::-webkit-scrollbar]:hidden"
      >
        {items.map((item, i) => {
          const selected = i === active;
          const a = ACCENT[item.brand] ?? "#3525cd";
          return (
            <button
              key={item.key}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => setActive(i)}
              style={selected ? { boxShadow: `0 6px 20px ${a}33` } : undefined}
              className={`flex shrink-0 items-center gap-2 rounded-xl px-4 py-2.5 text-[14px] font-semibold transition-colors ${
                selected ? "bg-white text-[#0f172a]" : "text-[#464555] hover:bg-white/70"
              }`}
            >
              <BrandLogo name={item.brand} className="h-5 w-5 shrink-0" />
              {item.name}
            </button>
          );
        })}
      </div>

      {/* Showcase panel */}
      <div className="relative mt-4 overflow-hidden rounded-2xl border border-[#eae6f4] bg-white p-7 shadow-[0_20px_50px_rgba(79,70,229,0.08)] sm:p-10">
        <div
          key={`${active}-bg`}
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 scale-105 blur-xl"
          style={{
            background: HAZE[current.brand] ?? HAZE.Site,
            ...(motionOk ? { animation: "ls-channel-fade 500ms ease" } : {}),
          }}
        />

        <div
          key={`${active}-fg`}
          className="relative flex flex-col-reverse gap-8 md:flex-row md:items-center"
          style={motionOk ? { animation: "ls-channel-fade 320ms ease" } : undefined}
        >
          {/* Text column */}
          <div className="min-w-0 flex-1">
            <div className="mb-4 flex items-center gap-3">
              <span
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
                style={{ backgroundColor: `${accent}14` }}
              >
                <BrandLogo name={current.brand} className="h-6 w-6" />
              </span>
              <span
                className="text-[13px] font-bold uppercase tracking-wider"
                style={{ color: accent }}
              >
                {current.name}
              </span>
            </div>

            <h3 className="max-w-lg text-[26px] font-bold leading-[1.15] tracking-[-0.01em] text-[#0f172a] sm:text-[32px]">
              {current.headline}
            </h3>
            <p className="mt-3 max-w-md text-[15px] leading-[24px] text-[#464555]">
              {current.caption}
            </p>

            <ul className="mt-6 flex flex-col gap-2.5">
              {current.points.map((p) => (
                <li key={p} className="flex items-center gap-2.5 text-[14px] text-[#334155]">
                  <svg
                    viewBox="0 0 24 24"
                    className="h-4 w-4 shrink-0"
                    fill="none"
                    stroke={accent}
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="m5 13 4 4L19 7" />
                  </svg>
                  {p}
                </li>
              ))}
            </ul>

            <a
              href={hireHref}
              className="mt-8 inline-flex h-11 items-center justify-center rounded-lg bg-[#3525cd] px-6 text-[14px] font-semibold text-white shadow-[0_12px_32px_rgba(53,37,205,0.22)] transition-all hover:bg-[#4f46e5]"
            >
              {t("cta")}
            </a>
          </div>

          {/* The two-person team, overlapped on the diagonal. Same pair on
              every channel — the badge just marks which channel is shown. */}
          <div className="mx-auto shrink-0 md:mx-0">
            <div className="relative h-40 w-44 sm:h-44 sm:w-48">
              {TEAM.map((img, i) => {
                const step = i - (TEAM.length - 1) / 2;
                const front = i === TEAM.length - 1;
                return (
                  <div
                    key={img.src}
                    className="absolute left-1/2 top-1/2 h-36 w-28 overflow-hidden rounded-xl bg-white ring-1 ring-black/5"
                    style={{
                      transform: `translate(-50%, -50%) translate(${step * 40}px, ${step * 18}px) rotate(${step * 15}deg)`,
                      zIndex: i,
                      boxShadow: front
                        ? "0 18px 40px rgba(15,23,42,0.20)"
                        : "0 8px 22px rgba(15,23,42,0.12)",
                    }}
                  >
                    <Image src={img} alt="" fill sizes="120px" className="object-cover object-top" />
                  </div>
                );
              })}
              <span className="absolute -bottom-2 right-0 z-10 flex h-11 w-11 items-center justify-center rounded-xl bg-white shadow-[0_6px_18px_rgba(15,23,42,0.16)]">
                <BrandLogo name={current.brand} className="h-6 w-6" />
              </span>
            </div>
            <p className="mt-6 text-center text-[12px] font-semibold text-[#64748b]">
              {t("teamCaption")}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
