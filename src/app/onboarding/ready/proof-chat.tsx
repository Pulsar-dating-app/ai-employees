"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useTranslations } from "next-intl";
import clsx from "clsx";
import { Button } from "@/components/ui/button";
import { SendIcon } from "@/components/ui/icons";
import { LinkifiedText } from "@/components/chat/linkified-text";

type Turn = { role: "customer" | "agent"; content: string };

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

  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (turns.length > 0) bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [turns, isSending]);

  async function send(text: string) {
    const message = text.trim();
    if (!message || isSending) return;

    setError(null);
    setDraft("");
    setTurns((prev) => [...prev, { role: "customer", content: message }]);
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

      setTurns((prev) => [...prev, { role: "agent", content: reply.content }]);
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

        {turns.map((turn, i) =>
          turn.role === "customer" ? (
            <p
              key={i}
              className="max-w-[85%] self-end rounded-2xl rounded-tr-sm bg-primary px-4 py-2.5 text-body-md text-on-primary"
            >
              {turn.content}
            </p>
          ) : (
            <div key={i} className="flex items-start gap-3">
              <Portrait portrait={portrait} name={agentName} />
              <div className="max-w-[85%] rounded-2xl rounded-tl-sm bg-surface-container-low px-4 py-2.5 text-body-md text-on-surface">
                <LinkifiedText text={turn.content} className="whitespace-pre-wrap" />
              </div>
            </div>
          ),
        )}

        {isSending ? (
          <div className="flex items-center gap-3">
            <Portrait portrait={portrait} name={agentName} />
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

function Portrait({ portrait, name }: { portrait: string | null; name: string }) {
  return (
    <span className="relative mt-0.5 h-8 w-8 shrink-0 overflow-hidden rounded-full bg-primary-fixed">
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
