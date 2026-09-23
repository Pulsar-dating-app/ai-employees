"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import clsx from "clsx";
import { ChevronLeftIcon, InfoIcon, SendIcon } from "@/components/ui/icons";
import { LinkifiedText } from "@/components/chat/linkified-text";
import { ProductCardList } from "@/components/chat/product-card-list";
import { channelLabel } from "@/lib/conversations/channel-label";
import type { ConversationDetail, ConversationMessage } from "@/lib/conversations/detail";
import type { ConversationRow } from "@/lib/conversations/list";
import { AgentAvatar, ChannelGlyph, CustomerAvatar } from "./customer-avatar";
import { ConversationDetails } from "./conversation-details";
import { GroundingNotice } from "./grounding-notice";
import { formatClock, formatDayLabel, isSameDay } from "./inbox-format";

const POLL_INTERVAL_MS = 5000;
const OPEN_CASCADE_LIMIT = 8;
const GROUP_GAP_MS = 10 * 60 * 1000;

export type ConversationData = { conversation: ConversationDetail; messages: ConversationMessage[] };

type MessageGroup = { role: ConversationMessage["role"]; start: number; messages: ConversationMessage[] };

function groupMessages(messages: ConversationMessage[]): MessageGroup[] {
  const groups: MessageGroup[] = [];
  messages.forEach((message, index) => {
    const last = groups[groups.length - 1];
    const lastMessage = last?.messages[last.messages.length - 1];
    const continues =
      last &&
      lastMessage &&
      last.role === message.role &&
      isSameDay(lastMessage.created_at, message.created_at) &&
      new Date(message.created_at).getTime() - new Date(lastMessage.created_at).getTime() < GROUP_GAP_MS;
    if (continues) {
      last.messages.push(message);
    } else {
      groups.push({ role: message.role, start: index, messages: [message] });
    }
  });
  return groups;
}

function bubbleShape(isTeam: boolean, position: number, count: number): string {
  if (count === 1) return isTeam ? "rounded-br-md" : "rounded-bl-md";
  if (position === 0) return isTeam ? "rounded-br-md" : "rounded-bl-md";
  if (position === count - 1) return isTeam ? "rounded-tr-md" : "rounded-tl-md";
  return isTeam ? "rounded-r-md" : "rounded-l-md";
}

function StatusPill({ status, agentName }: { status: string; agentName: string }) {
  const t = useTranslations("Conversations.inbox.thread.status");
  if (status === "active") {
    return (
      <span className="inline-flex items-center gap-2 rounded-full bg-success-100 px-3 py-1 text-[12px] font-semibold text-success-500">
        <span className="inbox-live-dot h-2 w-2 rounded-full bg-success-500" aria-hidden="true" />
        {t("active", { name: agentName })}
      </span>
    );
  }
  if (status === "paused") {
    return (
      <span className="inline-flex items-center gap-2 rounded-full bg-primary-fixed px-3 py-1 text-[12px] font-semibold text-primary">
        <span className="h-2 w-2 rounded-full bg-primary" aria-hidden="true" />
        {t("paused")}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-2 rounded-full bg-surface-container px-3 py-1 text-[12px] font-semibold text-on-surface-variant">
      <span className="h-2 w-2 rounded-full bg-outline" aria-hidden="true" />
      {t("closed")}
    </span>
  );
}

function ThreadSkeleton() {
  return (
    <div className="flex flex-1 flex-col justify-end gap-4 px-5 py-6 sm:px-8" aria-hidden="true">
      {[56, 72, 40, 64, 48].map((width, i) => (
        <div key={i} className={clsx("flex", i % 2 === 0 ? "justify-start" : "justify-end")}>
          <div
            className={clsx(
              "h-12 animate-pulse rounded-[20px]",
              i % 2 === 0 ? "bg-surface-container-high" : "bg-primary-fixed/70",
            )}
            style={{ width: `${width}%`, maxWidth: 420 }}
          />
        </div>
      ))}
    </div>
  );
}

export function ConversationPane({
  companyId,
  conversationId,
  row,
  cached,
  onLoaded,
  onBack,
  onReplySent,
  onStatusChange,
}: {
  companyId: string;
  conversationId: string;
  row: ConversationRow | undefined;
  cached: ConversationData | undefined;
  onLoaded: (data: ConversationData) => void;
  onBack: () => void;
  onReplySent: (message: ConversationMessage) => void;
  onStatusChange: (status: string) => void;
}) {
  const t = useTranslations("Conversations.inbox");
  const tRoot = useTranslations("Conversations");
  const locale = useLocale();

  const [data, setData] = useState<ConversationData | null>(cached ?? null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [draft, setDraft] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isResuming, setIsResuming] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [initialCount, setInitialCount] = useState<number | null>(cached ? cached.messages.length : null);
  const renderedCountRef = useRef(0);
  const sendingRef = useRef(false);
  const onLoadedRef = useRef(onLoaded);

  useEffect(() => {
    onLoadedRef.current = onLoaded;
  });

  useEffect(() => {
    if (isSending) return;
    let cancelled = false;

    function refresh() {
      if (document.hidden) return;
      fetch(`/api/companies/${companyId}/conversations/${conversationId}`)
        .then((res) => (res.ok ? res.json() : Promise.reject(res.status)))
        .then((next: ConversationData) => {
          if (cancelled) return;
          setInitialCount((count) => count ?? next.messages.length);
          setData(next);
          setLoadFailed(false);
          onLoadedRef.current(next);
        })
        .catch(() => {
          if (!cancelled) setLoadFailed(true);
        });
    }

    refresh();
    const intervalId = setInterval(refresh, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [companyId, conversationId, isSending, reloadKey]);

  const messageCount = data?.messages.length ?? 0;

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el || messageCount === 0) return;
    const previous = renderedCountRef.current;
    renderedCountRef.current = messageCount;
    if (previous === 0) {
      el.scrollTop = el.scrollHeight;
      return;
    }
    if (messageCount > previous) {
      const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 160;
      if (nearBottom) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    }
  }, [messageCount]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && detailsOpen) setDetailsOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [detailsOpen]);

  const conversation = data?.conversation ?? null;
  const customerName = conversation?.customer.displayName ?? row?.customer.displayName ?? "";
  const customerSeed = conversation?.customer.id ?? row?.customer.id ?? conversationId;
  const channel = conversation?.channel ?? row?.channel ?? "web_chat";
  const status = conversation?.status ?? row?.status ?? "active";
  const agentName = conversation?.agentName ?? row?.agentName ?? null;
  const agentLabel = agentName ?? t("thread.teamFallback");
  const agentPhotoSrc = conversation?.agentPhotoSrc ?? row?.agentPhotoSrc ?? null;

  function resizeTextarea() {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }

  async function handleSend() {
    const text = draft.trim();
    if (!text || sendingRef.current) return;
    sendingRef.current = true;

    setErrorMessage(null);
    setIsSending(true);

    const res = await fetch(`/api/companies/${companyId}/conversations/${conversationId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: text }),
    }).catch(() => null);

    sendingRef.current = false;
    setIsSending(false);

    if (!res || !res.ok) {
      setErrorMessage(t("thread.sendError"));
      return;
    }

    const { message, delivery } = await res.json();
    setDraft("");
    requestAnimationFrame(resizeTextarea);
    setData((prev) =>
      prev
        ? {
            conversation: { ...prev.conversation, status: "paused" },
            messages: [...prev.messages, message],
          }
        : prev,
    );
    onReplySent(message);
    if (delivery && delivery.ok === false) {
      setErrorMessage(t("thread.deliveryFailed"));
    }
  }

  async function handleResume() {
    setIsResuming(true);
    const res = await fetch(`/api/companies/${companyId}/conversations/${conversationId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "active" }),
    }).catch(() => null);
    setIsResuming(false);
    if (res?.ok) {
      setData((prev) => (prev ? { ...prev, conversation: { ...prev.conversation, status: "active" } } : prev));
      onStatusChange("active");
    }
  }

  const groups = data ? groupMessages(data.messages) : [];
  const initialGroups = groups.filter((g) => g.start < (initialCount ?? 0)).length;

  return (
    <div className="relative flex h-full min-h-0 flex-col bg-surface">
      <header className="flex items-center gap-3 border-b border-outline-variant/60 bg-surface-container-lowest/90 px-3 py-3 backdrop-blur-md sm:px-5">
        <button
          type="button"
          onClick={onBack}
          aria-label={t("thread.back")}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-on-surface-variant transition-colors hover:bg-surface-container lg:hidden"
        >
          <ChevronLeftIcon className="h-5 w-5" />
        </button>
        <CustomerAvatar seed={customerSeed} name={customerName || "?"} channel={channel} />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-[15px] font-semibold leading-5 text-on-surface">{customerName}</h2>
          <p className="mt-0.5 flex items-center gap-1.5 truncate text-[12px] text-on-surface-variant">
            <ChannelGlyph channel={channel} className="h-3.5 w-3.5 shrink-0" />
            {channelLabel(tRoot, channel)}
          </p>
        </div>
        <div className="hidden sm:block">
          <StatusPill status={status} agentName={agentLabel} />
        </div>
        <button
          type="button"
          onClick={() => setDetailsOpen((open) => !open)}
          aria-label={t("details.open")}
          aria-expanded={detailsOpen}
          className={clsx(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
            detailsOpen ? "bg-primary-fixed text-primary" : "text-on-surface-variant hover:bg-surface-container",
          )}
        >
          <InfoIcon className="h-5 w-5" />
        </button>
      </header>

      <div className="flex justify-center border-b border-outline-variant/40 bg-surface-container-lowest/60 px-4 py-2 sm:hidden">
        <StatusPill status={status} agentName={agentLabel} />
      </div>

      <div ref={scrollRef} className="chat-scroll min-h-0 flex-1 overflow-y-auto">
        {!data ? (
          loadFailed ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
              <p className="text-sm text-on-surface-variant">{t("thread.loadError")}</p>
              <button
                type="button"
                onClick={() => setReloadKey((k) => k + 1)}
                className="rounded-full bg-surface-container px-4 py-2 text-[13px] font-semibold text-on-surface transition-colors hover:bg-surface-container-high"
              >
                {t("thread.retry")}
              </button>
            </div>
          ) : (
            <div className="flex h-full flex-col">
              <ThreadSkeleton />
            </div>
          )
        ) : data.messages.length === 0 ? (
          <div className="flex h-full items-center justify-center px-6">
            <p className="text-sm text-on-surface-variant">{t("thread.empty")}</p>
          </div>
        ) : (
          <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col justify-end gap-1 px-4 py-6 sm:px-8">
            {groups.map((group, gi) => {
              const isTeam = group.role !== "customer";
              const first = group.messages[0];
              const lastInGroup = group.messages[group.messages.length - 1];
              const previousGroup = groups[gi - 1];
              const newDay =
                !previousGroup ||
                !isSameDay(previousGroup.messages[previousGroup.messages.length - 1].created_at, first.created_at);
              const isInitial = group.start < (initialCount ?? 0);
              const cascade = Math.min(initialGroups - 1 - gi, OPEN_CASCADE_LIMIT);
              const label = group.role === "merchant" ? t("you") : group.role === "agent" ? agentLabel : null;

              return (
                <div key={`${group.start}-${first.created_at}`} className="flex flex-col">
                  {newDay ? (
                    <div className="sticky top-2 z-10 my-3 flex justify-center">
                      <span className="rounded-full bg-surface-container-lowest/90 px-3 py-1 text-[11px] font-semibold text-on-surface-variant shadow-[0_1px_2px_rgba(25,28,29,0.08)] ring-1 ring-outline-variant/50 backdrop-blur">
                        {formatDayLabel(first.created_at, locale, t("today"), t("yesterday"))}
                      </span>
                    </div>
                  ) : null}
                  <div
                    className={clsx(
                      "flex items-end gap-2 pt-3",
                      isTeam ? "justify-end" : "justify-start",
                      isInitial
                        ? cascade >= 0 && cascade < OPEN_CASCADE_LIMIT
                          ? "inbox-bubble-in"
                          : null
                        : "chat-message-in",
                    )}
                    style={isInitial && cascade >= 0 ? ({ "--i": cascade } as React.CSSProperties) : undefined}
                  >
                    <div
                      className={clsx(
                        "flex min-w-0 max-w-[82%] flex-col gap-1 sm:max-w-[72%]",
                        isTeam ? "items-end" : "items-start",
                      )}
                    >
                      {label ? (
                        <span className="px-1 text-[11px] font-semibold text-on-surface-variant">{label}</span>
                      ) : null}
                      {group.messages.map((m, mi) => (
                        <div
                          key={`${m.created_at}-${mi}`}
                          className={clsx(
                            "flex flex-col gap-1",
                            isTeam ? "items-end" : "items-start",
                            m.metadata && "w-full",
                          )}
                        >
                          <div
                            className={clsx(
                              "rounded-[20px] px-4 py-2.5 text-[14px] leading-[1.45]",
                              bubbleShape(isTeam, mi, group.messages.length),
                              m.metadata && "w-full",
                              m.role === "customer" &&
                                "bg-surface-container-lowest text-on-surface shadow-[0_1px_2px_rgba(25,28,29,0.06)] ring-1 ring-outline-variant/50",
                              m.role === "agent" && "bg-primary-fixed text-on-primary-fixed",
                              m.role === "merchant" &&
                                "bg-primary text-on-primary shadow-[0_4px_12px_-4px_rgba(53,37,205,0.45)]",
                            )}
                          >
                            <LinkifiedText text={m.content} className="whitespace-pre-wrap break-words" />
                            {m.metadata ? <ProductCardList products={m.metadata.products} locale={locale} /> : null}
                          </div>
                          {m.grounding ? <GroundingNotice grounding={m.grounding} /> : null}
                        </div>
                      ))}
                      <span className="px-1 text-[11px] tabular-nums text-outline">
                        {formatClock(lastInGroup.created_at, locale)}
                      </span>
                    </div>
                    {group.role === "agent" ? (
                      <AgentAvatar photoSrc={agentPhotoSrc} name={agentLabel} className="mb-5 h-7 w-7" />
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="border-t border-outline-variant/60 bg-surface-container-lowest">
        {status === "paused" ? (
          <div className="flex flex-col gap-3 border-b border-outline-variant/40 bg-primary-fixed/40 px-4 py-3 sm:flex-row sm:items-center sm:px-5">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <AgentAvatar photoSrc={agentPhotoSrc} name={agentLabel} className="h-8 w-8 opacity-70 grayscale-[40%]" />
              <p className="text-[13px] leading-5 text-on-surface">{t("thread.handbackBody", { name: agentLabel })}</p>
            </div>
            <button
              type="button"
              onClick={handleResume}
              disabled={isResuming}
              className="inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-full bg-primary px-4 text-[13px] font-semibold text-on-primary shadow-[0_4px_12px_-4px_rgba(53,37,205,0.55)] transition-[transform,filter] duration-150 hover:brightness-110 active:scale-[0.97] disabled:opacity-70"
            >
              {isResuming ? <span className="onboarding-loader" /> : null}
              {t("thread.handbackButton", { name: agentLabel })}
            </button>
          </div>
        ) : null}

        <div className="px-3 py-3 sm:px-5">
          <div className="flex items-end gap-2 rounded-[22px] border border-outline-variant/70 bg-surface py-1.5 pl-4 pr-1.5 transition-[border-color,box-shadow,background-color] duration-200 focus-within:border-primary/40 focus-within:bg-surface-container-lowest focus-within:shadow-[0_0_0_4px_rgba(53,37,205,0.08)]">
            <textarea
              ref={textareaRef}
              value={draft}
              rows={1}
              aria-label={t("thread.placeholder")}
              placeholder={t("thread.placeholder")}
              disabled={isSending}
              onChange={(e) => {
                setDraft(e.target.value);
                resizeTextarea();
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              className="max-h-40 min-h-9 flex-1 resize-none bg-transparent py-2 text-[14px] leading-5 text-on-surface outline-none placeholder:text-outline disabled:opacity-60"
            />
            <button
              type="button"
              onClick={handleSend}
              disabled={!draft.trim() || isSending}
              aria-label={t("thread.send")}
              className={clsx(
                "flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-[transform,background-color,color,box-shadow] duration-200",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
                draft.trim()
                  ? "bg-primary text-on-primary shadow-[0_4px_12px_-4px_rgba(53,37,205,0.6)] hover:brightness-110 active:scale-90"
                  : "bg-surface-container-high text-outline",
              )}
            >
              {isSending ? <span className="onboarding-loader" /> : <SendIcon className="h-4 w-4 translate-x-[1px]" />}
            </button>
          </div>
          {errorMessage ? (
            <p role="alert" className="mt-2 px-2 text-[12px] leading-4 text-error">
              {errorMessage}
            </p>
          ) : status === "active" ? (
            <p className="mt-2 px-2 text-[11px] leading-4 text-outline">
              {t("thread.composerHint", { name: agentLabel })}
            </p>
          ) : null}
        </div>
      </div>

      <ConversationDetails
        open={detailsOpen}
        onClose={() => setDetailsOpen(false)}
        customerSeed={customerSeed}
        customerName={customerName}
        channel={channel}
        status={status}
        agentName={agentName}
        agentPhotoSrc={agentPhotoSrc}
        createdAt={conversation?.createdAt ?? null}
        lastActivity={data?.messages[data.messages.length - 1]?.created_at ?? row?.updatedAt ?? null}
        messageCount={data?.messages.length ?? null}
        row={row}
      />
    </div>
  );
}
