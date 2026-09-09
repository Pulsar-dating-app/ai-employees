"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { SendIcon, XIcon } from "@/components/ui/icons";
import { LinkifiedText } from "@/components/chat/linkified-text";
import { ProductCardList } from "@/components/chat/product-card-list";
import { readMessageMetadata, type MessageMetadata } from "@/lib/chat/product-cards";

// F5 -- 'merchant' is a human teammate replying manually from the
// Conversations dashboard (as opposed to 'agent', the AI's own reply).
// Rendered identically to 'agent' here -- the customer sees one consistent
// "business" bubble style regardless of who's actually typing; the only
// visible sign a human joined is the one-time banner below.
type ChatMessage = {
  role: "customer" | "agent" | "merchant";
  content: string;
  created_at: string;
  // Product cards the API attached to this reply. Persisted server-side, so
  // a refresh reloads them with the message rather than leaving the text
  // referring to pictures that are no longer there.
  metadata?: MessageMetadata | null;
};

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

function timeLabel(iso: string, locale: string): string {
  return new Date(iso).toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit" });
}

function isBusinessSide(role: ChatMessage["role"]): boolean {
  return role === "agent" || role === "merchant";
}

// The transcript plus the index from which messages are genuinely new, so
// only those get the arrival animation: a returning visitor's history must
// render already settled, and a 5s poll that changes nothing must not
// replay the last bubble. Carried in the same state as the list itself
// (rather than a ref diffed during render) so the flag is decided once, at
// the moment the list changes, and never re-decided under a live animation.
type ChatView = { list: ChatMessage[]; arrivalsFrom: number };

function withArrivals(previous: ChatView | null, list: ChatMessage[]): ChatView {
  return { list, arrivalsFrom: previous === null ? list.length : previous.list.length };
}

const STAMP_CLASS = "mt-1 text-label-sm font-normal tabular-nums text-on-surface-variant";

const AVATAR_DIMENSIONS = {
  hero: "h-16 w-16 text-body-lg",
  header: "h-11 w-11 text-label-md",
  bubble: "h-8 w-8 text-label-sm",
} as const;

function AgentAvatarCircle({
  photoSrc,
  name,
  size,
}: {
  photoSrc: string | null;
  name: string;
  size: keyof typeof AVATAR_DIMENSIONS;
}) {
  return (
    <div className={`relative shrink-0 overflow-hidden rounded-full bg-primary-fixed ${AVATAR_DIMENSIONS[size]}`}>
      {photoSrc ? (
        <Image src={photoSrc} alt={name} fill sizes="64px" className="object-cover object-top" />
      ) : (
        <span className="flex h-full w-full items-center justify-center font-semibold text-on-primary-fixed">
          {name.charAt(0).toUpperCase()}
        </span>
      )}
    </div>
  );
}

function PresenceDot({ className }: { className?: string }) {
  return <span className={`absolute rounded-full border-2 border-surface-container-lowest bg-secondary ${className}`} />;
}

export function ChatWidget({
  companySlug,
  agentSlug,
  agentName,
  agentPhotoSrc,
  companyName,
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

  const [view, setView] = useState<ChatView | null>(null);
  const [isBlockedHere, setIsBlockedHere] = useState(false);
  const [draft, setDraft] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // Whether the message list is scrolled to (near) the bottom. Starts true
  // so the first load lands at the newest message; flips as the visitor
  // scrolls up to read history, which is when we must NOT yank them back
  // down on the next poll / reply.
  const pinnedToBottomRef = useRef(true);
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
          if (!cancelled) setView((prev) => withArrivals(prev, data.messages ?? []));
        })
        .catch(() => {
          if (!cancelled) setView((prev) => withArrivals(prev, []));
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

  // Only follow the conversation down when the visitor is already at the
  // bottom. A poll refresh or an agent reply while they're reading earlier
  // messages must leave their scroll position alone.
  useEffect(() => {
    if (pinnedToBottomRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [view, isSending]);

  function handleScroll() {
    const el = scrollRef.current;
    if (!el) return;
    pinnedToBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  }

  async function handleSend() {
    const text = draft.trim();
    const sessionId = sessionIdRef.current;
    if (!text || isSending || !sessionId) return;

    setErrorMessage(null);
    // The visitor just sent something — snap to the bottom to show it and
    // the reply, regardless of where they'd scrolled.
    pinnedToBottomRef.current = true;
    setView((prev) =>
      withArrivals(prev, [
        ...(prev?.list ?? []),
        { role: "customer", content: text, created_at: new Date().toISOString() },
      ]),
    );
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
    // It's a chat: keep the cursor in the box so the visitor can just keep
    // typing. Clicking Send (or the textarea being briefly busy) moves focus
    // away otherwise, forcing a click back into the field every message.
    textareaRef.current?.focus();

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
    if (reply) setView((prev) => withArrivals(prev, [...(prev?.list ?? []), reply]));
  }

  // "*" as the target origin is correct here, not a shortcut -- the widget
  // is embedded on an arbitrary third-party site it can't know in advance
  // (same reasoning embed-authorization.ts documents for why the domain
  // check itself has to work this way), and the payload carries nothing
  // sensitive.
  function handleClose() {
    window.parent.postMessage({ type: "staffra-chat:close" }, "*");
  }

  const list = view?.list ?? [];
  const dayLabels = list.map((m) => dayLabel(m.created_at, locale, t("today"), t("yesterday")));
  const firstMerchantIndex = list.findIndex((m) => m.role === "merchant");
  const arrivalsFrom = view?.arrivalsFrom ?? 0;
  const isReady = view !== null;

  return (
    <div className="chat-root flex h-screen flex-col bg-surface">
      <header className="z-10 flex shrink-0 items-center justify-between gap-4 border-b border-outline-variant bg-surface-container-lowest px-4 py-3 shadow-level1 md:px-8">
        <div className="flex min-w-0 items-center gap-3">
          <div className="relative">
            <AgentAvatarCircle photoSrc={agentPhotoSrc} name={agentName} size="header" />
            <PresenceDot className="bottom-0 right-0 h-3 w-3" />
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-body-lg font-semibold leading-tight text-on-surface">{agentName}</h1>
            <p className="mt-0.5 truncate text-label-sm font-medium text-on-surface-variant">{t("activeNow")}</p>
          </div>
        </div>
        {isEmbedded ? (
          <button
            type="button"
            onClick={handleClose}
            aria-label={t("closeButton")}
            className="-mr-1 shrink-0 rounded-full p-2 text-on-surface-variant transition-colors hover:bg-surface-container-low hover:text-on-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            <XIcon className="h-5 w-5" />
          </button>
        ) : null}
      </header>

      {isBlockedHere ? (
        <main className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-container text-on-surface-variant">
            <XIcon className="h-6 w-6" />
          </div>
          <p className="max-w-sm text-body-md text-on-surface-variant">{t("unavailableHere")}</p>
        </main>
      ) : (
        <>
          <main
            ref={scrollRef}
            onScroll={handleScroll}
            className="chat-scroll flex flex-1 flex-col items-center overflow-y-auto px-4 md:px-6"
          >
            <div role="log" className="flex w-full max-w-2xl flex-1 flex-col py-6">
              {!isReady ? null : list.length === 0 ? (
                <div className="flex flex-1 flex-col items-center justify-center px-4 text-center">
                  <div className="relative">
                    <AgentAvatarCircle photoSrc={agentPhotoSrc} name={agentName} size="hero" />
                    <PresenceDot className="bottom-0.5 right-0.5 h-3.5 w-3.5" />
                  </div>
                  <p className="mt-4 text-body-lg font-semibold text-on-surface">{agentName}</p>
                  <p className="mt-1 text-label-md text-on-surface-variant">{companyName}</p>
                  <p className="mt-5 max-w-xs text-pretty text-body-md text-on-surface-variant">
                    {t("welcomePrompt", { name: agentName })}
                  </p>
                </div>
              ) : (
                list.map((m, i) => {
                  const side = isBusinessSide(m.role) ? "business" : "customer";
                  const prevSide = i > 0 ? (isBusinessSide(list[i - 1].role) ? "business" : "customer") : null;
                  const nextSide =
                    i < list.length - 1 ? (isBusinessSide(list[i + 1].role) ? "business" : "customer") : null;

                  const showDivider = i === 0 || dayLabels[i] !== dayLabels[i - 1];
                  const nextShowsDivider = i < list.length - 1 && dayLabels[i + 1] !== dayLabels[i];
                  // F5 -- shown once, immediately before the first human reply
                  // in the whole history. Never re-shown for later merchant
                  // messages in the same conversation.
                  const showTeamJoined = i === firstMerchantIndex;
                  const nextShowsTeamJoined = i + 1 === firstMerchantIndex;

                  // A "group" is a run of consecutive messages from the same
                  // side on the same day: one avatar, one timestamp, one
                  // tail, and tight spacing between the bubbles inside it.
                  const startsGroup = showDivider || showTeamJoined || prevSide !== side;
                  const endsGroup = nextSide !== side || nextShowsDivider || nextShowsTeamJoined;

                  // A bubble carrying cards takes the full column width --
                  // shrink-to-fit on a two-line sentence would squeeze the
                  // thumbnails into a strip narrower than the text above them.
                  const cards = side === "business" ? readMessageMetadata(m.metadata) : null;
                  const topSpacing = showDivider || showTeamJoined ? "" : startsGroup ? "mt-5" : "mt-1";
                  const arriving = i >= arrivalsFrom ? "chat-message-in" : "";

                  const stamp = (offset: string) =>
                    endsGroup ? (
                      <time dateTime={m.created_at} className={`${STAMP_CLASS} ${offset}`}>
                        {timeLabel(m.created_at, locale)}
                      </time>
                    ) : null;

                  return (
                    <div key={i} className="flex flex-col">
                      {showDivider ? (
                        <div className={`flex items-center gap-3 ${i === 0 ? "mb-5" : "my-6"}`}>
                          <span className="h-px flex-1 bg-outline-variant/70" />
                          <span className="text-label-sm font-medium text-on-surface-variant">{dayLabels[i]}</span>
                          <span className="h-px flex-1 bg-outline-variant/70" />
                        </div>
                      ) : null}

                      {showTeamJoined ? (
                        <div className="my-5 flex justify-center">
                          <span className="rounded-full bg-surface-container px-3 py-1 text-label-sm font-medium text-on-surface-variant">
                            {t("teamJoined")}
                          </span>
                        </div>
                      ) : null}

                      {side === "business" ? (
                        <div className={`flex flex-col items-start ${topSpacing} ${arriving}`}>
                          <div className="flex w-full max-w-[82%] items-end gap-2.5">
                            <div className="w-8 shrink-0">
                              {endsGroup ? (
                                <AgentAvatarCircle photoSrc={agentPhotoSrc} name={agentName} size="bubble" />
                              ) : null}
                            </div>
                            <div
                              className={`w-fit rounded-2xl border border-outline-variant/60 bg-surface-container-lowest px-4 py-2.5 text-body-md text-on-surface shadow-level1 ${
                                endsGroup ? "rounded-bl-sm" : ""
                              } ${cards ? "w-full" : ""}`}
                            >
                              <LinkifiedText text={m.content} className="whitespace-pre-wrap" />
                              {cards ? <ProductCardList products={cards.products} locale={locale} /> : null}
                            </div>
                          </div>
                          {stamp("ml-[2.625rem]")}
                        </div>
                      ) : (
                        <div className={`flex flex-col items-end ${topSpacing} ${arriving}`}>
                          <div
                            className={`w-fit max-w-[82%] rounded-2xl bg-primary px-4 py-2.5 text-body-md text-on-primary shadow-level1 ${
                              endsGroup ? "rounded-br-sm" : ""
                            }`}
                          >
                            <LinkifiedText text={m.content} className="whitespace-pre-wrap" />
                          </div>
                          {stamp("mr-1")}
                        </div>
                      )}
                    </div>
                  );
                })
              )}

              {isSending ? (
                <div className="mt-5 flex items-end gap-2.5">
                  <div className="w-8 shrink-0">
                    <AgentAvatarCircle photoSrc={agentPhotoSrc} name={agentName} size="bubble" />
                  </div>
                  <div
                    role="status"
                    aria-label={t("typing", { name: agentName })}
                    className="chat-message-in flex items-center gap-1.5 rounded-2xl rounded-bl-sm border border-outline-variant/60 bg-surface-container-lowest px-4 py-3.5 shadow-level1"
                  >
                    <span className="chat-typing-dot h-2 w-2 rounded-full bg-on-surface-variant" />
                    <span className="chat-typing-dot h-2 w-2 rounded-full bg-on-surface-variant [animation-delay:180ms]" />
                    <span className="chat-typing-dot h-2 w-2 rounded-full bg-on-surface-variant [animation-delay:360ms]" />
                  </div>
                </div>
              ) : null}

              {errorMessage ? (
                <p
                  role="alert"
                  className="mt-5 self-center rounded-full bg-error-container px-3.5 py-1.5 text-label-md text-on-error-container"
                >
                  {errorMessage}
                </p>
              ) : null}

              <div ref={bottomRef} />
            </div>
          </main>

          <div className="shrink-0 border-t border-outline-variant bg-surface-container-lowest/85 px-4 pb-[max(0.875rem,env(safe-area-inset-bottom))] pt-3.5 backdrop-blur-md md:px-6">
            <div className="mx-auto max-w-2xl">
              <div className="flex items-end gap-2 rounded-2xl border border-outline-variant bg-surface-container-lowest p-1.5 shadow-level1 transition-shadow duration-200 focus-within:border-primary focus-within:shadow-level2 focus-within:ring-2 focus-within:ring-primary/15">
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
                  // Stays enabled while a reply is in flight so the visitor can
                  // keep typing and never loses the caret; handleSend guards
                  // against an overlapping send.
                  disabled={!isReady}
                  className="max-h-[120px] w-full resize-none bg-transparent px-2.5 py-2 text-body-md text-on-surface caret-primary placeholder:text-outline focus:outline-none"
                />
                <button
                  type="button"
                  onClick={handleSend}
                  disabled={!draft.trim() || isSending || !isReady}
                  aria-label={t("sendButton")}
                  className="flex shrink-0 items-center justify-center rounded-xl bg-primary p-2.5 text-on-primary shadow-level1 transition-[filter,transform,opacity] duration-150 hover:brightness-90 active:scale-95 disabled:opacity-40 disabled:shadow-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                >
                  <SendIcon className="h-5 w-5" />
                </button>
              </div>
              <p className="pt-2.5 text-center text-label-sm font-normal text-on-surface-variant">{t("poweredBy")}</p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
