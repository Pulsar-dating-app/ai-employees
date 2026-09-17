"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useTranslations } from "next-intl";
import clsx from "clsx";
import { Button } from "@/components/ui/button";
import { SendIcon } from "@/components/ui/icons";
import { LinkifiedText } from "@/components/chat/linkified-text";
import { finishOnboarding } from "@/lib/companies/finish-onboarding";

type Turn = { role: "customer" | "agent"; content: string };

// Same device as the hosted chat widget's own withArrivals: the index a
// turn is new from lives in the same state as the list itself, decided once
// at the moment a turn is appended, rather than a ref diffed during render
// (which the transcript's own re-renders -- the typing dots toggling -- can
// race). Only turns at or after arrivalsFrom carry the entrance animation.
type View = { turns: Turn[]; arrivalsFrom: number };

function appendTurn(view: View, turn: Turn): View {
  return { turns: [...view.turns, turn], arrivalsFrom: view.turns.length };
}

// The proof is a rehearsal, and deliberately so. The agent, her prompt, her
// reads and the grounding check are all the real thing -- she answers from
// the merchant's own catalogue or agenda. What is staged is only the writing:
// nothing she "books" reaches the calendar, no confirmation email goes out,
// and this conversation never appears in the inbox or the numbers. See
// agent-engine/tools/rehearsal.ts.
export function ProofChat({
  companyId,
  agentSlug,
  agentName,
  portrait,
  suggestions,
}: {
  companyId: string;
  agentSlug: string;
  agentName: string;
  portrait: string | null;
  suggestions: string[];
}) {
  const t = useTranslations("Onboarding.ready");

  const [view, setView] = useState<View>({ turns: [], arrivalsFrom: 0 });
  const [draft, setDraft] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const { turns, arrivalsFrom } = view;

  useEffect(() => {
    if (turns.length > 0) bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [turns, isSending]);

  async function send(text: string) {
    const message = text.trim();
    if (!message || isSending) return;

    setError(null);
    setDraft("");
    setView((prev) => appendTurn(prev, { role: "customer", content: message }));
    setIsSending(true);

    try {
      const res = await fetch(`/api/companies/${companyId}/agents/${agentSlug}/preview-chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      });

      if (!res.ok) {
        setError(t("error"));
        return;
      }

      const { reply } = await res.json();
      if (!reply?.content) {
        setError(t("errorSilent", { name: agentName }));
        return;
      }

      setView((prev) => appendTurn(prev, { role: "agent", content: reply.content }));
    } catch {
      setError(t("error"));
    } finally {
      setIsSending(false);
    }
  }

  // "She has answered", not "I have typed". The flow's next step is gated on
  // proof_seen_at, which the route stamps when the reply actually lands -- so
  // enabling this on the sent message let a merchant click through in the gap
  // and get bounced straight back here.
  const answered = turns.some((turn) => turn.role === "agent");
  const started = turns.length > 0;

  return (
    <div className="flex flex-col gap-6">
      <div
        role="log"
        aria-live="polite"
        aria-label={t("logLabel", { name: agentName })}
        className={clsx(
          "flex flex-col gap-3 overflow-y-auto rounded-lg border border-primary-fixed bg-white/70 p-5 transition-[max-height] duration-300",
          started ? "max-h-[340px] min-h-[180px]" : "min-h-[120px]",
        )}
      >
        <div className="flex items-start gap-3">
          <Portrait portrait={portrait} name={agentName} />
          <p className="max-w-[85%] rounded-2xl rounded-tl-sm bg-surface-container-low px-4 py-2.5 text-body-md text-on-surface">
            {t("opener", { name: agentName })}
          </p>
        </div>

        {turns.map((turn, i) => {
          const arriving = i >= arrivalsFrom ? "chat-message-in" : "";
          return turn.role === "customer" ? (
            <p
              key={i}
              className={clsx(
                arriving,
                "max-w-[85%] self-end rounded-2xl rounded-tr-sm bg-primary px-4 py-2.5 text-body-md text-on-primary",
              )}
            >
              {turn.content}
            </p>
          ) : (
            <div key={i} className={clsx(arriving, "flex items-start gap-3")}>
              <Portrait portrait={portrait} name={agentName} />
              <div className="max-w-[85%] rounded-2xl rounded-tl-sm bg-surface-container-low px-4 py-2.5 text-body-md text-on-surface">
                <LinkifiedText text={turn.content} className="whitespace-pre-wrap" />
              </div>
            </div>
          );
        })}

        {isSending ? (
          <div className="flex items-center gap-3">
            <Portrait portrait={portrait} name={agentName} active />
            <span className="flex items-center gap-1 rounded-2xl rounded-tl-sm bg-surface-container-low px-4 py-3.5">
              <span className="sr-only">{t("typing", { name: agentName })}</span>
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="h-1.5 w-1.5 rounded-full bg-on-surface-variant/60"
                  style={{ animation: `chat-typing 1.2s ${i * 0.15}s infinite ease-in-out` }}
                />
              ))}
            </span>
          </div>
        ) : null}

        <div ref={bottomRef} />
      </div>

      {!started && suggestions.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {suggestions.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              onClick={() => send(suggestion)}
              className="rounded-full border border-primary/30 bg-primary-fixed/40 px-4 py-2 text-label-md font-medium text-primary transition-colors hover:bg-primary-fixed focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/25"
            >
              {suggestion}
            </button>
          ))}
        </div>
      ) : null}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(draft);
        }}
        className="flex items-center gap-2"
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={t("placeholder")}
          aria-label={t("placeholder")}
          disabled={isSending}
          className="h-12 flex-1 rounded-md border border-outline-variant bg-surface-container-lowest px-4 text-body-md text-on-surface transition-all duration-200 placeholder:text-on-surface-variant focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/20 disabled:opacity-70"
        />
        <button
          type="submit"
          disabled={!draft.trim() || isSending}
          aria-label={t("send")}
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-primary text-on-primary transition-[filter] hover:brightness-90 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/25 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <SendIcon className="h-5 w-5" />
        </button>
      </form>

      {error ? (
        <p role="alert" className="text-sm text-error">
          {error}
        </p>
      ) : null}

      {/* Same exit as every earlier step's own "skip": a plain text link, not
          a second button competing with Continue. finishOnboarding parks the
          merchant same as it does there -- nothing here traps her either. */}
      <form action={finishOnboarding}>
        <button
          type="submit"
          className="w-fit rounded-md text-label-md font-medium text-on-surface-variant underline-offset-4 transition-colors hover:text-on-surface hover:underline focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/25"
        >
          {t("skip")}
        </button>
      </form>

      <div className="flex flex-wrap items-center justify-end gap-3 border-t border-primary-fixed pt-6">
        <p className="mr-auto text-label-sm text-on-surface-variant">
          {answered ? t("continueHint") : t("askFirstHint", { name: agentName })}
        </p>
        {answered ? (
          <Link href="/onboarding/plan">
            <Button type="button">{t("continue")}</Button>
          </Link>
        ) : (
          <Button type="button" variant="secondary" disabled>
            {t("continue")}
          </Button>
        )}
      </div>
    </div>
  );
}

// `active` marks the one instance that sits beside the typing dots -- a
// soft ring blooming from her own portrait while she composes the reply
// this whole step is building to, rather than a bare spinner standing in
// for her.
function Portrait({
  portrait,
  name,
  active,
}: {
  portrait: string | null;
  name: string;
  active?: boolean;
}) {
  return (
    <span
      className={clsx(
        "relative mt-0.5 h-8 w-8 shrink-0 overflow-hidden rounded-full bg-primary-fixed",
        active && "onboarding-portrait-active",
      )}
    >
      {portrait ? (
        <Image src={portrait} alt="" fill sizes="32px" className="object-cover object-top" />
      ) : (
        <span className="flex h-full w-full items-center justify-center text-label-sm font-semibold text-primary">
          {name.charAt(0)}
        </span>
      )}
    </span>
  );
}
