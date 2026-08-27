"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";

export type DemoMessage = { from: "customer" | "malu" | "bot"; text: string };

type Slot =
  | { kind: "message"; message: DemoMessage; shown: number }
  | { kind: "typing" };

function fullSlots(messages: DemoMessage[]): Slot[] {
  return messages.map((message) => ({ kind: "message", message, shown: message.text.length }));
}

// One WhatsApp-style frame used for both sides of the "Humanized
// Conversations" comparison, so only the conversation differs, not the
// chrome. `animate` off renders the thread statically (the "old way"
// menu); on, it types itself out character-by-character.
//
// The typing starts only once the frame is actually scrolled into view
// (IntersectionObserver), not on page load — so a visitor who lands above
// it sees it play from the top when they arrive.
//
// No "already played" ref guard on purpose: that pattern defeats React
// Strict Mode's dev-only double-invoke (mount → cleanup → mount) and
// leaves the thread frozen; the per-run `cancelled` flag alone makes the
// effect safely re-runnable.
export function WhatsAppThread({
  messages,
  contactName,
  avatarSrc,
  animate = true,
}: {
  messages: DemoMessage[];
  contactName: string;
  avatarSrc?: string;
  animate?: boolean;
}) {
  const t = useTranslations("LandingV2.demo");
  const [slots, setSlots] = useState<Slot[]>(animate ? [] : fullSlots(messages));
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!animate) return;
    let cancelled = false;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (reduceMotion) {
      queueMicrotask(() => {
        if (!cancelled) setSlots(fullSlots(messages));
      });
      return () => {
        cancelled = true;
      };
    }

    const built: Slot[] = [];

    async function playNext(index: number) {
      if (cancelled || index >= messages.length) return;
      const message = messages[index];
      const incoming = message.from !== "customer";

      if (incoming) {
        built.push({ kind: "typing" });
        setSlots([...built]);
        await wait(850);
        if (cancelled) return;
        built.pop();
      }

      const slot: Slot = { kind: "message", message, shown: 0 };
      built.push(slot);
      const speed = incoming ? 16 : 26;

      for (let i = 1; i <= message.text.length; i++) {
        if (cancelled) return;
        slot.shown = i;
        setSlots([...built]);
        await wait(speed);
      }

      await wait(500);
      playNext(index + 1);
    }

    let startTimer: ReturnType<typeof setTimeout> | undefined;
    const start = () => {
      startTimer = setTimeout(() => playNext(0), 200);
    };

    const el = rootRef.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      // No node yet, or unsupported — fall back to playing on mount.
      start();
      return () => {
        cancelled = true;
        if (startTimer) clearTimeout(startTimer);
      };
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          observer.disconnect();
          start();
        }
      },
      { threshold: 0.3 },
    );
    observer.observe(el);

    return () => {
      cancelled = true;
      observer.disconnect();
      if (startTimer) clearTimeout(startTimer);
    };
  }, [messages, animate]);

  return (
    <div
      ref={rootRef}
      className="overflow-hidden rounded-2xl border border-[#e7e8e9] bg-white shadow-[0_4px_20px_rgba(0,0,0,0.05)]"
    >
      {/* Light header — WhatsApp Web's chrome, so the frame sits inside the
          page's palette rather than fighting it. */}
      <div className="flex items-center gap-3 border-b border-[#e7e8e9] bg-[#f6f5f3] px-4 py-3">
        {avatarSrc ? (
          <Image
            src={avatarSrc}
            alt=""
            width={38}
            height={38}
            className="h-[38px] w-[38px] rounded-full object-cover object-top"
          />
        ) : (
          <span className="flex h-[38px] w-[38px] items-center justify-center rounded-full bg-[#dfe3e6] text-[#5b6470]">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-5 w-5"
              aria-hidden="true"
            >
              <rect x="4" y="8" width="16" height="12" rx="2" />
              <path d="M12 8V4H8" />
              <path d="M2 14h2" />
              <path d="M20 14h2" />
              <path d="M9 13v2" />
              <path d="M15 13v2" />
            </svg>
          </span>
        )}
        <div className="flex flex-col leading-tight">
          <span className="text-[14px] font-semibold text-[#191c1d]">{contactName}</span>
          <span className="text-[11px] text-[#6b7280]">{t("online")}</span>
        </div>
        <svg
          viewBox="0 0 24 24"
          fill="currentColor"
          className="ml-auto h-[18px] w-[18px] text-[#25d366]"
          aria-hidden="true"
        >
          <path d="M12.04 2c-5.46 0-9.91 4.45-9.91 9.91 0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38a9.9 9.9 0 0 0 4.79 1.22h.01c5.46 0 9.91-4.45 9.91-9.91S17.5 2 12.04 2Zm5.8 14.16c-.24.68-1.42 1.32-1.95 1.36-.5.05-.97.24-3.27-.68-2.77-1.09-4.53-3.92-4.67-4.11-.14-.19-1.12-1.49-1.12-2.84 0-1.35.71-2.02.96-2.29.24-.27.53-.34.71-.34.18 0 .36 0 .51.01.16.01.39-.06.6.46.24.58.81 2 .88 2.14.07.14.12.31.02.5-.09.19-.14.31-.28.48-.14.17-.29.37-.42.5-.14.14-.28.29-.12.56.16.27.72 1.18 1.54 1.92 1.06.94 1.95 1.24 2.22 1.38.27.14.43.12.59-.07.16-.19.68-.79.86-1.06.18-.27.36-.22.6-.13.24.09 1.55.73 1.81.86.27.14.44.2.51.31.07.12.07.68-.17 1.36Z" />
        </svg>
      </div>

      {/* Thread. The animated copy is hidden from assistive tech: a
          character-by-character stream would be announced as a run of
          half-words. The full conversation is exposed once, statically. */}
      <div
        aria-hidden="true"
        className="flex min-h-[280px] flex-col gap-2 bg-[#ece5dd] px-4 py-4 text-[13.5px] leading-[1.45] text-[#111b21]"
      >
        {slots.map((slot, i) =>
          slot.kind === "typing" ? (
            <TypingIndicator key="typing" />
          ) : (
            <Bubble
              key={i}
              from={slot.message.from}
              text={slot.message.text.slice(0, slot.shown)}
              done={slot.shown === slot.message.text.length}
            />
          ),
        )}
      </div>
      <ul className="sr-only">
        <li>{t("transcriptLabel")}</li>
        {messages.map((message, i) => (
          <li key={i}>
            {message.from === "customer" ? t("customerLabel") : contactName}: {message.text}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Bubble({
  from,
  text,
  done,
}: {
  from: DemoMessage["from"];
  text: string;
  done: boolean;
}) {
  const outgoing = from === "customer";
  return (
    <div
      className={`v2-bubble-in max-w-[82%] whitespace-pre-line rounded-lg px-2.5 py-[7px] shadow-[0_1px_0.5px_rgba(0,0,0,0.13)] ${
        outgoing
          ? "self-end rounded-tr-sm bg-[#d9fdd3]"
          : "self-start rounded-tl-sm bg-white"
      }`}
    >
      {text}
      {outgoing && done ? (
        <span className="ml-1.5 inline-block align-baseline text-[9px] text-[#53bdeb]">
          ✓✓
        </span>
      ) : null}
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="flex w-fit items-center gap-[3px] self-start rounded-lg rounded-tl-sm bg-white px-3 py-2.5 shadow-[0_1px_0.5px_rgba(0,0,0,0.13)]">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="v2-typing-dot h-[5px] w-[5px] rounded-full bg-[#9aa0a6]"
          style={{ animationDelay: `${i * 0.16}s` }}
        />
      ))}
    </div>
  );
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
