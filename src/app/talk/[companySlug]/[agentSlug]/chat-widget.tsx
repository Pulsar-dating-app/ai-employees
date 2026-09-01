"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { SendIcon, XIcon } from "@/components/ui/icons";

// F5 -- 'merchant' is a human teammate replying manually from the
// Conversations dashboard (as opposed to 'agent', the AI's own reply).
// Rendered identically to 'agent' here -- the customer sees one consistent
// "business" bubble style regardless of who's actually typing; the only
// visible sign a human joined is the one-time banner below.
type ChatMessage = { role: "customer" | "agent" | "merchant"; content: string; created_at: string };

const POLL_INTERVAL_MS = 5000;

const SESSION_STORAGE_PREFIX = "staffra-chat-session";

// Client-generated, stored in localStorage, never a cookie -- this page is
// always same-origin to its own API even once embedded (M5), so
// localStorage is the right mechanism (see M3's decisions.md entry). Scoped
// per company+agent so one browser can hold separate sessions with
// different merchants' chats.
function getOrCreateSessionId(companySlug: string, agentSlug: string): string {
  const key = `${SESSION_STORAGE_PREFIX}:${companySlug}:${agentSlug}`;
  const existing = window.localStorage.getItem(key);
  if (existing) return existing;
  const id = crypto.randomUUID();
  window.localStorage.setItem(key, id);
  return id;
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

// The Stitch mockup only shows a static "Today" divider. Real, persisted
// history (the whole point of M2/M3) needs to read sensibly across
// multiple days for a returning visitor -- so messages are grouped by
// calendar day, computed from each message's created_at.
function dayLabel(iso: string, locale: string, today: string, yesterday: string): string {
  const date = new Date(iso);
  const now = new Date();
  const yesterdayDate = new Date(now);
  yesterdayDate.setDate(now.getDate() - 1);

  if (isSameDay(date, now)) return today;
  if (isSameDay(date, yesterdayDate)) return yesterday;
  return date.toLocaleDateString(locale, {
    day: "numeric",
    month: "long",
    year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
  });
}

function AgentAvatarCircle({
  photoSrc,
  name,
  size,
}: {
  photoSrc: string | null;
  name: string;
  size: "header" | "bubble";
}) {
  const dimension = size === "header" ? "h-12 w-12" : "h-8 w-8";
  return (
    <div className={`relative shrink-0 overflow-hidden rounded-full bg-primary-fixed ${dimension}`}>
      {photoSrc ? (
        <Image src={photoSrc} alt={name} fill sizes="48px" className="object-cover object-top" />
      ) : (
        <span className="flex h-full w-full items-center justify-center text-sm font-semibold text-primary">
          {name.charAt(0).toUpperCase()}
        </span>
      )}
    </div>
  );
}

export function ChatWidget({
  companySlug,
  agentSlug,
  agentName,
  agentPhotoSrc,
}: {
  companySlug: string;
  agentSlug: string;
  agentName: string;
  agentPhotoSrc: string | null;
  companyName: string;
}) {
  const t = useTranslations("Chat");
  const locale = useLocale();
  // Set on the iframe src by widget.js (M5) -- a plain URL param, not a
  // browser-only value, so it's available identically during SSR and
  // hydration (no client-only-value/hydration-mismatch problem the way
  // window.self !== window.top would be). Purely a UI signal (show the
  // close button); the actual security-relevant value is document.referrer,
  // read inline wherever embeddedOn is sent, never cached.
  const isEmbedded = useSearchParams().get("embedded") === "1";

  const [messages, setMessages] = useState<ChatMessage[] | null>(null);
  const [isBlockedHere, setIsBlockedHere] = useState(false);
  const [draft, setDraft] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // Not React state: the id itself never needs to trigger a re-render --
  // "is the chat ready" is already properly derived from `messages` (null
  // until the fetch below resolves), so this only needs to be readable by
  // the effect and handleSend.
  const sessionIdRef = useRef<string | null>(null);

  useEffect(() => {
    const sessionId = getOrCreateSessionId(companySlug, agentSlug);
    sessionIdRef.current = sessionId;
    let cancelled = false;

    function fetchHistory() {
      const embeddedOnParam = isEmbedded ? `&embeddedOn=${encodeURIComponent(document.referrer)}` : "";

      return fetch(`/api/chat/${companySlug}/${agentSlug}?sessionId=${sessionId}${embeddedOnParam}`)
        .then((res) => {
          // page.tsx already confirmed the agent is actively hired before
          // ChatWidget ever rendered -- once embedded, the only new reason
          // this specific request can 403 is the domain allowlist (M1/M3),
          // so a 403 here is unambiguous, no error-message-text parsing
          // needed.
          if (isEmbedded && res.status === 403) {
            if (!cancelled) setIsBlockedHere(true);
            return { messages: [] };
          }
          return res.ok ? res.json() : { messages: [] };
        })
        .then((data) => {
          if (!cancelled) setMessages(data.messages ?? []);
        })
        .catch(() => {
          if (!cancelled) setMessages([]);
        });
    }

    // F5 -- a merchant's manual reply is sent from an entirely separate
    // dashboard session, so it can only ever reach this page by polling.
    // Both the immediate call and the recurring interval are skipped while
    // a send is in flight (isSending), so a poll can never race the
    // optimistic-append-then-POST sequence in handleSend.
    let intervalId: ReturnType<typeof setInterval> | null = null;
    if (isSending) {
      // Nothing to do -- handleSend owns the message list until its own
      // POST resolves; this effect re-runs once isSending flips back.
    } else {
      fetchHistory();
      intervalId = setInterval(fetchHistory, POLL_INTERVAL_MS);
    }

    return () => {
      cancelled = true;
      if (intervalId) clearInterval(intervalId);
    };
  }, [companySlug, agentSlug, isEmbedded, isSending]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isSending]);

  async function handleSend() {
    const text = draft.trim();
    const sessionId = sessionIdRef.current;
    if (!text || isSending || !sessionId) return;

    setErrorMessage(null);
    setMessages((prev) => [...(prev ?? []), { role: "customer", content: text, created_at: new Date().toISOString() }]);
    setDraft("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
    setIsSending(true);

    const res = await fetch(`/api/chat/${companySlug}/${agentSlug}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId,
        message: text,
        ...(isEmbedded ? { embeddedOn: document.referrer } : {}),
      }),
    });

    setIsSending(false);

    if (!res.ok) {
      setErrorMessage(res.status === 429 ? t("errorRateLimited") : t("errorGeneric"));
      return;
    }

    // `reply` is null when the conversation is paused (F5) -- a human is
    // expected to handle it, so there's genuinely no AI reply to show. The
    // customer's own message (already appended above, and persisted
    // server-side regardless) is the only thing that changes; polling will
    // pick up a merchant's eventual manual reply.
    const { reply } = await res.json();
    if (reply) setMessages((prev) => [...(prev ?? []), reply]);
  }

  // "*" as the target origin is correct here, not a shortcut -- the widget
  // is embedded on an arbitrary third-party site it can't know in advance
  // (same reasoning embed-authorization.ts documents for why the domain
  // check itself has to work this way), and the payload carries nothing
  // sensitive.
  function handleClose() {
    window.parent.postMessage({ type: "staffra-chat:close" }, "*");
  }

  let lastDayLabel: string | null = null;
  let teamJoinedShown = false;

  return (
    <div className="flex h-screen flex-col bg-surface">
      <header className="flex shrink-0 items-center justify-between gap-4 border-b border-outline-variant bg-surface-container-lowest px-4 py-3 shadow-level1 md:px-10">
        <div className="flex items-center gap-4">
          <div className="relative">
            <AgentAvatarCircle photoSrc={agentPhotoSrc} name={agentName} size="header" />
            <div className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-surface-container-lowest bg-tertiary-fixed-dim" />
          </div>
          <div>
            <h1 className="font-headline-md text-headline-md font-semibold text-on-surface">{agentName}</h1>
            <p className="text-label-sm text-on-surface-variant">{t("activeNow")}</p>
          </div>
        </div>
        {isEmbedded ? (
          <button
            type="button"
            onClick={handleClose}
            aria-label={t("closeButton")}
            className="rounded-full p-2 text-on-surface-variant transition-colors hover:bg-surface-container-low"
          >
            <XIcon className="h-5 w-5" />
          </button>
        ) : null}
      </header>

      {isBlockedHere ? (
        <main className="flex flex-1 flex-col items-center justify-center px-6 text-center">
          <p className="max-w-sm text-body-md text-on-surface-variant">{t("unavailableHere")}</p>
        </main>
      ) : (
        <>
      <main className="flex flex-1 flex-col items-center overflow-y-auto px-4 pb-4 md:px-0">
        <div className="flex w-full max-w-3xl flex-1 flex-col gap-6 py-8">
          {messages === null ? null : messages.length === 0 ? (
            <p className="mt-8 text-center text-body-md text-on-surface-variant">{t("emptyState")}</p>
          ) : (
            messages.map((m, i) => {
              const label = dayLabel(m.created_at, locale, t("today"), t("yesterday"));
              const showDivider = label !== lastDayLabel;
              lastDayLabel = label;

              // F5 -- shown once, immediately before the first human reply
              // in the whole history. Never re-shown for later merchant
              // messages in the same conversation.
              const showTeamJoined = m.role === "merchant" && !teamJoinedShown;
              if (showTeamJoined) teamJoinedShown = true;

              return (
                <div key={i} className="flex flex-col gap-6">
                  {showDivider ? (
                    <div className="flex justify-center">
                      <span className="rounded-full bg-surface-container-low px-3 py-1 text-label-sm text-on-surface-variant">
                        {label}
                      </span>
                    </div>
                  ) : null}

                  {showTeamJoined ? (
                    <div className="flex justify-center">
                      <span className="rounded-full bg-tertiary-container/10 px-3 py-1 text-label-sm text-tertiary-container">
                        {t("teamJoined")}
                      </span>
                    </div>
                  ) : null}

                  {m.role === "agent" || m.role === "merchant" ? (
                    <div className="flex w-full max-w-[85%] gap-3">
                      <AgentAvatarCircle photoSrc={agentPhotoSrc} name={agentName} size="bubble" />
                      <div className="rounded-2xl rounded-tl-sm border border-outline-variant/30 bg-surface-container-lowest p-4 text-body-md text-on-surface shadow-level1">
                        <p className="whitespace-pre-wrap">{m.content}</p>
                      </div>
                    </div>
                  ) : (
                    <div className="flex w-full justify-end">
                      <div className="max-w-[85%] rounded-2xl rounded-tr-sm bg-primary p-4 text-body-md text-on-primary shadow-sm">
                        <p className="whitespace-pre-wrap">{m.content}</p>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}

          {isSending ? (
            <div className="flex w-full max-w-[85%] gap-3">
              <AgentAvatarCircle photoSrc={agentPhotoSrc} name={agentName} size="bubble" />
              <div className="flex items-center gap-1.5 rounded-2xl rounded-tl-sm border border-outline-variant/30 bg-surface-container-lowest px-4 py-3 shadow-sm">
                <span className="h-2 w-2 animate-pulse rounded-full bg-primary/40" />
                <span className="h-2 w-2 animate-pulse rounded-full bg-primary/40 [animation-delay:150ms]" />
                <span className="h-2 w-2 animate-pulse rounded-full bg-primary/40 [animation-delay:300ms]" />
              </div>
            </div>
          ) : null}

          {errorMessage ? (
            <p role="alert" className="text-center text-sm text-error">
              {errorMessage}
            </p>
          ) : null}

          <div ref={bottomRef} />
        </div>
      </main>

      <div className="shrink-0 border-t border-outline-variant bg-surface-container-lowest/80 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 backdrop-blur-md md:px-10">
        <div className="mx-auto max-w-3xl">
          <div className="flex items-end gap-2 rounded-xl border border-outline-variant bg-surface-container-lowest p-2 shadow-level1 transition-all duration-200 focus-within:border-primary focus-within:ring-1 focus-within:ring-primary">
            <textarea
              ref={textareaRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onInput={(e) => {
                const el = e.currentTarget;
                el.style.height = "auto";
                el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder={t("inputPlaceholder", { name: agentName })}
              rows={1}
              disabled={isSending || messages === null}
              className="max-h-[120px] w-full resize-none bg-transparent px-2 py-2.5 text-body-md text-on-surface placeholder:text-outline focus:outline-none"
            />
            <button
              type="button"
              onClick={handleSend}
              disabled={!draft.trim() || isSending || messages === null}
              aria-label={t("sendButton")}
              className="flex shrink-0 items-center justify-center rounded-lg bg-primary p-2 text-on-primary shadow-sm transition-colors hover:brightness-90 disabled:opacity-50"
            >
              <SendIcon className="h-5 w-5" />
            </button>
          </div>
          <p className="mb-2 mt-3 text-center text-label-sm text-outline-variant">{t("poweredBy")}</p>
        </div>
      </div>
        </>
      )}
    </div>
  );
}
