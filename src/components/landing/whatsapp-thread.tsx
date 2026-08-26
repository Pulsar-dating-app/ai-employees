"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

export type DemoMessage = { from: "customer" | "malu"; text: string };

type Slot =
  | { kind: "message"; message: DemoMessage; shown: number }
  | { kind: "typing" };

// A real conversation from the product spec typing itself out. No "already
// played" ref guard on purpose — that pattern defeats React Strict Mode's
// dev-only double-invoke (mount → cleanup → mount) and leaves the thread
// frozen; the per-run `cancelled` flag alone makes the effect re-runnable.
export function WhatsAppThread({ messages }: { messages: DemoMessage[] }) {
  const [slots, setSlots] = useState<Slot[]>([]);
  const t = useTranslations("Landing.demo");

  useEffect(() => {
    let cancelled = false;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (reduceMotion) {
      queueMicrotask(() => {
        if (!cancelled) {
          setSlots(messages.map((message) => ({ kind: "message", message, shown: message.text.length })));
        }
      });
      return () => {
        cancelled = true;
      };
    }

    const built: Slot[] = [];

    async function playNext(index: number) {
      if (cancelled || index >= messages.length) return;
      const message = messages[index];

      if (message.from === "malu") {
        built.push({ kind: "typing" });
        setSlots([...built]);
        await wait(800);
        if (cancelled) return;
        built.pop();
      }

      const slot: Slot = { kind: "message", message, shown: 0 };
      built.push(slot);
      const speed = message.from === "malu" ? 15 : 24;

      for (let i = 1; i <= message.text.length; i++) {
        if (cancelled) return;
        slot.shown = i;
        setSlots([...built]);
        await wait(speed);
      }

      await wait(450);
      playNext(index + 1);
    }

    const startTimer = setTimeout(() => playNext(0), 380);
    return () => {
      cancelled = true;
      clearTimeout(startTimer);
    };
  }, [messages]);

  return (
    <>
      {/* The animated copy is hidden from assistive tech: a character-by-
          character stream would be announced as a run of half-words. The
          full conversation is exposed once, statically, below it. */}
      <div
        aria-hidden="true"
        className="flex min-h-[188px] flex-col gap-[6px] px-2.5 py-3 text-[12px] text-[#14130f]"
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
            {message.from === "malu" ? "Malu" : t("customerLabel")}: {message.text}
          </li>
        ))}
      </ul>
    </>
  );
}

function Bubble({ from, text, done }: { from: DemoMessage["from"]; text: string; done: boolean }) {
  const isHer = from === "malu";
  return (
    <div
      className={`l-bubble-in max-w-[84%] rounded-[10px] px-2.5 py-[7px] leading-[1.4] shadow-[0_1px_0.5px_rgba(0,0,0,0.13)] ${
        isHer ? "self-end rounded-br-[3px] bg-[#d9fdd3]" : "self-start rounded-bl-[3px] bg-white"
      }`}
    >
      {text}
      {isHer && done ? (
        <span className="ml-1.5 inline-block align-baseline text-[8.5px] text-[#53bdeb]">✓✓</span>
      ) : null}
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="flex w-fit items-center gap-[3px] self-start rounded-[10px] rounded-bl-[3px] bg-white px-3 py-2.5 shadow-[0_1px_0.5px_rgba(0,0,0,0.13)]">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="l-typing-dot h-[4.5px] w-[4.5px] rounded-full bg-[#9aa0a6]"
          style={{ animationDelay: `${i * 0.16}s` }}
        />
      ))}
    </div>
  );
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
