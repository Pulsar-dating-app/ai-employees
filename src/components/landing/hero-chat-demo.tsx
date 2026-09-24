"use client";

import { useEffect, useRef, useState } from "react";
import Image, { type StaticImageData } from "next/image";
import clsx from "clsx";
import { CalendarIcon, CheckIcon, WhatsAppIcon } from "@/components/ui/icons";
import { useSlidingIndicator } from "@/components/ui/use-sliding-indicator";
import { M } from "./landing-icons";

type Mode = "sales" | "scheduling";
const MODES: Mode[] = ["sales", "scheduling"];
const ROTATE_MS = 9000;

export type HeroChatCopy = {
  tablistLabel: string;
  sample: string;
  status: string;
  sales: {
    tab: string;
    name: string;
    role: string;
    customer1: string;
    agent1: string;
    productName: string;
    productPrice: string;
    productStock: string;
    agent2: string;
    customer2: string;
    agent3: string;
    checkoutHost: string;
  };
  scheduling: {
    tab: string;
    name: string;
    role: string;
    customer1: string;
    agent1: string;
    slot1: string;
    slot2: string;
    customer2: string;
    appointmentService: string;
    appointmentWhen: string;
    appointmentStatus: string;
    agent2: string;
  };
};

function Bubble({
  from,
  index,
  animate,
  children,
}: {
  from: "agent" | "customer";
  index: number;
  animate: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={clsx(
        "max-w-[86%] rounded-2xl px-3.5 py-2.5 text-[13.5px] leading-[1.45]",
        from === "agent"
          ? "self-start rounded-tl-md bg-white text-[#0f172a] shadow-[0_2px_8px_rgba(15,23,42,0.05)]"
          : "self-end rounded-tr-md bg-[#dcf8c6] text-[#0f172a]",
        animate && "chat-message-in",
      )}
      style={animate ? { animationDelay: `${index * 140}ms` } : undefined}
    >
      {children}
    </div>
  );
}

export function HeroChatDemo({
  copy,
  maluImg,
  anaImg,
}: {
  copy: HeroChatCopy;
  maluImg: StaticImageData;
  anaImg: StaticImageData;
}) {
  const [mode, setMode] = useState<Mode>("sales");
  const [animate, setAnimate] = useState(false);
  const [autoRotate, setAutoRotate] = useState(true);
  const [paused, setPaused] = useState(false);
  const tabRefs = useRef<Partial<Record<Mode, HTMLButtonElement | null>>>({});
  const { indicatorRef, register } = useSlidingIndicator<HTMLButtonElement>(mode, null, "x");

  useEffect(() => {
    if (!autoRotate || paused) return;
    if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = setTimeout(() => {
      setAnimate(true);
      setMode((m) => (m === "sales" ? "scheduling" : "sales"));
    }, ROTATE_MS);
    return () => clearTimeout(timer);
  }, [mode, autoRotate, paused]);

  function choose(next: Mode) {
    setAutoRotate(false);
    if (next === mode) return;
    setAnimate(true);
    setMode(next);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const next = mode === "sales" ? "scheduling" : "sales";
    choose(next);
    tabRefs.current[next]?.focus();
  }

  const isSales = mode === "sales";
  const agent = isSales ? copy.sales : copy.scheduling;

  return (
    <div
      className="flex flex-col gap-4"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
    >
      <div
        role="tablist"
        aria-label={copy.tablistLabel}
        onKeyDown={onKeyDown}
        className="relative mx-auto grid w-full max-w-sm grid-cols-2 rounded-full bg-white p-1 shadow-[0_4px_24px_rgba(79,70,229,0.1)]"
      >
        <span
          ref={indicatorRef}
          aria-hidden="true"
          className="inbox-indicator absolute left-0 rounded-full bg-[#3525cd] opacity-0 shadow-[0_6px_16px_-6px_rgba(53,37,205,0.6)]"
        />
        {MODES.map((key) => {
          const selected = mode === key;
          const tab = key === "sales" ? copy.sales : copy.scheduling;
          return (
            <button
              key={key}
              ref={(el) => {
                register(key)(el);
                tabRefs.current[key] = el;
              }}
              type="button"
              role="tab"
              id={`hero-demo-tab-${key}`}
              aria-selected={selected}
              aria-controls="hero-demo-panel"
              tabIndex={selected ? 0 : -1}
              onClick={() => choose(key)}
              className={clsx(
                "relative z-10 flex h-10 items-center justify-center gap-2 rounded-full text-[14px] font-semibold transition-colors duration-200",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3525cd]",
                selected ? "text-white" : "text-[#464555] hover:text-[#0f172a]",
              )}
            >
              {key === "sales" ? <M name="shopping_bag" size={16} /> : <CalendarIcon className="h-4 w-4" />}
              {tab.tab}
            </button>
          );
        })}
      </div>

      <div
        id="hero-demo-panel"
        role="tabpanel"
        aria-labelledby={`hero-demo-tab-${mode}`}
        className="overflow-hidden rounded-[28px] bg-white shadow-[0_24px_60px_-20px_rgba(53,37,205,0.28)] ring-1 ring-[#e7e3f7]"
      >
        <div className="flex items-center gap-3 border-b border-[#efecf8] px-4 py-3">
          <div className="relative">
            <Image
              key={mode}
              src={isSales ? maluImg : anaImg}
              alt=""
              sizes="44px"
              className="h-11 w-11 rounded-full object-cover object-top"
            />
            <span className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-[#25D366] text-white ring-2 ring-white">
              <WhatsAppIcon className="h-2.5 w-2.5" />
            </span>
          </div>
          <div className="min-w-0 flex-1 text-left">
            <p className="text-[15px] font-semibold text-[#0f172a]">
              {agent.name} <span className="hidden font-normal text-[#64748b] sm:inline">· {agent.role}</span>
            </p>
            <p className="text-[12px] font-medium text-[#10b981]">{copy.status}</p>
          </div>
          <span className="rounded-full bg-[#f5f2ff] px-2.5 py-1 text-[11px] font-semibold text-[#464555]">
            {copy.sample}
          </span>
        </div>

        <div className="grid bg-[#efeae2] bg-[radial-gradient(#e2dccf_1px,transparent_1px)] [background-size:16px_16px]">
          <div
            key={isSales ? "sales-active" : "sales-idle"}
            aria-hidden={!isSales}
            className={clsx("col-start-1 row-start-1 flex flex-col gap-2 px-3.5 py-4 sm:px-4", !isSales && "invisible")}
          >
            <Bubble from="customer" index={0} animate={animate && isSales}>
              {copy.sales.customer1}
            </Bubble>
            <Bubble from="agent" index={1} animate={animate && isSales}>
              <p>{copy.sales.agent1}</p>
              <div className="mt-2 flex items-center gap-3 rounded-xl bg-[#f5f2ff] p-2.5">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white text-[#3525cd]">
                  <M name="shopping_bag" size={18} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-semibold">{copy.sales.productName}</span>
                  <span className="block text-[12px] text-[#10b981]">{copy.sales.productStock}</span>
                </span>
                <span className="shrink-0 text-[13px] font-semibold tabular-nums">{copy.sales.productPrice}</span>
              </div>
              <p className="mt-2">{copy.sales.agent2}</p>
            </Bubble>
            <Bubble from="customer" index={2} animate={animate && isSales}>
              {copy.sales.customer2}
            </Bubble>
            <Bubble from="agent" index={3} animate={animate && isSales}>
              <p>{copy.sales.agent3}</p>
              <span className="mt-2 flex items-center gap-2.5 rounded-xl bg-[#f5f2ff] px-3 py-2.5">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white text-[#3525cd]">
                  <M name="link" size={15} />
                </span>
                <span className="truncate text-[13px] font-semibold text-[#3525cd] underline decoration-[#3525cd]/30 underline-offset-2">
                  {copy.sales.checkoutHost}
                </span>
              </span>
            </Bubble>
          </div>
          <div
            key={isSales ? "scheduling-idle" : "scheduling-active"}
            aria-hidden={isSales}
            className={clsx("col-start-1 row-start-1 flex flex-col gap-2 px-3.5 py-4 sm:px-4", isSales && "invisible")}
          >
            <Bubble from="customer" index={0} animate={animate && !isSales}>
              {copy.scheduling.customer1}
            </Bubble>
            <Bubble from="agent" index={1} animate={animate && !isSales}>
              <p>{copy.scheduling.agent1}</p>
              <div className="mt-2 flex gap-2">
                {[copy.scheduling.slot1, copy.scheduling.slot2].map((slot) => (
                  <span
                    key={slot}
                    className="rounded-lg border border-[#3525cd]/25 bg-[#f5f2ff] px-3 py-1.5 text-[13px] font-semibold tabular-nums text-[#3525cd]"
                  >
                    {slot}
                  </span>
                ))}
              </div>
            </Bubble>
            <Bubble from="customer" index={2} animate={animate && !isSales}>
              {copy.scheduling.customer2}
            </Bubble>
            <Bubble from="agent" index={3} animate={animate && !isSales}>
              <div className="flex items-center gap-3 rounded-xl bg-[#f5f2ff] p-2.5">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white text-[#006591]">
                  <CalendarIcon className="h-[18px] w-[18px]" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-semibold">{copy.scheduling.appointmentService}</span>
                  <span className="flex flex-wrap items-center gap-x-2 text-[12px] text-[#464555]">
                    {copy.scheduling.appointmentWhen}
                    <span className="inline-flex items-center gap-1 font-semibold text-[#10b981]">
                      <CheckIcon className="h-3.5 w-3.5" />
                      {copy.scheduling.appointmentStatus}
                    </span>
                  </span>
                </span>
              </div>
              <p className="mt-2">{copy.scheduling.agent2}</p>
            </Bubble>
          </div>
        </div>
      </div>
    </div>
  );
}
