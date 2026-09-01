"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import clsx from "clsx";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { ConversationDetail, ConversationMessage } from "@/lib/conversations/detail";

const POLL_INTERVAL_MS = 5000;

const STATUS_STYLES: Record<string, string> = {
  paused: "bg-error-container text-on-error-container",
  active: "bg-secondary-container/40 text-on-secondary-container",
  closed: "bg-surface-container text-on-surface-variant",
};

function AvatarCircle({ photoSrc, name }: { photoSrc: string | null; name: string }) {
  return (
    <div className="relative flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary-fixed">
      {photoSrc ? (
        <Image src={photoSrc} alt={name} fill sizes="32px" className="object-cover object-top" />
      ) : (
        <span className="text-xs font-semibold text-primary">{name.charAt(0).toUpperCase()}</span>
      )}
    </div>
  );
}

// Trello F5 -- the merchant's own view of a conversation: full transcript,
// reply box (sending pauses the AI implicitly), Resume AI. Unlike the
// customer-facing chat-widget.tsx, agent vs. merchant messages ARE visually
// distinguished here ("AI" / "Team" label) -- the one deliberate difference
// between the two internal roles, useful for the merchant's own
// accountability even though the customer never sees it.
export function ConversationThread({
  companyId,
  conversationId,
  initialConversation,
  initialMessages,
}: {
  companyId: string;
  conversationId: string;
  initialConversation: ConversationDetail;
  initialMessages: ConversationMessage[];
}) {
  const t = useTranslations("Conversations.detail");

  const [conversation, setConversation] = useState(initialConversation);
  const [messages, setMessages] = useState(initialMessages);
  const [draft, setDraft] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isResuming, setIsResuming] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (isSending) return;

    let cancelled = false;
    function refresh() {
      fetch(`/api/companies/${companyId}/conversations/${conversationId}`)
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (!cancelled && data) {
            setConversation(data.conversation);
            setMessages(data.messages);
          }
        })
        .catch(() => {});
    }
    const intervalId = setInterval(refresh, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [companyId, conversationId, isSending]);

  async function handleSend() {
    const text = draft.trim();
    if (!text || isSending) return;

    setErrorMessage(null);
    setIsSending(true);

    const res = await fetch(`/api/companies/${companyId}/conversations/${conversationId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: text }),
    });

    setIsSending(false);

    if (!res.ok) {
      setErrorMessage(t("sendError"));
      return;
    }

    const { message, delivery } = await res.json();
    setDraft("");
    setMessages((prev) => [...prev, message]);
    setConversation((prev) => (prev.status === "paused" ? prev : { ...prev, status: "paused" }));
    // N10: on a channel that needs an outbound send (Instagram), the reply
    // is always saved but may not have reached the customer -- e.g. past the
    // 24h window (N11) or a dead connection. Say so; the text isn't lost.
    if (delivery && delivery.ok === false) {
      setErrorMessage(t("deliveryFailed"));
    }
  }

  async function handleResume() {
    setIsResuming(true);
    const res = await fetch(`/api/companies/${companyId}/conversations/${conversationId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "active" }),
    });
    setIsResuming(false);
    if (res.ok) {
      setConversation((prev) => ({ ...prev, status: "active" }));
    }
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
      <div className="flex flex-col rounded-xl border border-outline-variant bg-surface-container-lowest shadow-level1 lg:col-span-8">
        <div className="flex items-center justify-between gap-4 border-b border-outline-variant px-6 py-4">
          <div className="flex items-center gap-3">
            <AvatarCircle photoSrc={conversation.agentPhotoSrc} name={conversation.agentName ?? "?"} />
            <div>
              <h1 className="text-lg font-semibold text-on-surface">{conversation.customer.displayName}</h1>
              <p className="text-xs text-on-surface-variant">{t("withAgent", { name: conversation.agentName ?? "" })}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span
              className={clsx(
                "inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold",
                STATUS_STYLES[conversation.status] ?? STATUS_STYLES.closed,
              )}
            >
              {t(`status.${conversation.status}`)}
            </span>
            {conversation.status === "paused" ? (
              <Button type="button" variant="secondary" size="sm" isLoading={isResuming} onClick={handleResume}>
                {t("resumeButton")}
              </Button>
            ) : null}
          </div>
        </div>

        <div className="flex max-h-[60vh] flex-1 flex-col gap-4 overflow-y-auto px-6 py-6">
          {messages.length === 0 ? (
            <p className="text-sm text-on-surface-variant">{t("emptyState")}</p>
          ) : (
            messages.map((m, i) => (
              <div key={i} className={m.role === "customer" ? "flex justify-end" : "flex justify-start"}>
                <div className="flex max-w-[75%] flex-col gap-1">
                  {m.role !== "customer" ? (
                    <span className="ml-1 text-xs font-medium text-on-surface-variant">
                      {m.role === "merchant" ? t("teamLabel") : t("aiLabel")}
                    </span>
                  ) : null}
                  <div
                    className={clsx(
                      "rounded-2xl px-4 py-2.5 text-sm",
                      m.role === "customer"
                        ? "rounded-tr-sm bg-primary text-on-primary"
                        : "rounded-tl-sm border border-outline-variant/30 bg-surface-container-low text-on-surface",
                    )}
                  >
                    <p className="whitespace-pre-wrap">{m.content}</p>
                  </div>
                </div>
              </div>
            ))
          )}
          <div ref={bottomRef} />
        </div>

        {errorMessage ? (
          <p role="alert" className="px-6 text-sm text-error">
            {errorMessage}
          </p>
        ) : null}

        <div className="flex items-end gap-2 border-t border-outline-variant p-4">
          <div className="flex-1">
            <Textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder={t("inputPlaceholder")}
              rows={2}
              disabled={isSending}
            />
          </div>
          <Button type="button" isLoading={isSending} disabled={!draft.trim()} onClick={handleSend}>
            {t("sendButton")}
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-4 rounded-xl border border-outline-variant bg-surface-container-lowest p-6 shadow-level1 lg:col-span-4">
        <h2 className="text-sm font-semibold text-on-surface">{t("detailsTitle")}</h2>
        <dl className="flex flex-col gap-3 text-sm">
          <div>
            <dt className="text-xs text-on-surface-variant">{t("detailsCustomer")}</dt>
            <dd className="text-on-surface">{conversation.customer.displayName}</dd>
          </div>
          <div>
            <dt className="text-xs text-on-surface-variant">{t("detailsChannel")}</dt>
            <dd className="text-on-surface">{t(`channel.${conversation.channel}`)}</dd>
          </div>
          <div>
            <dt className="text-xs text-on-surface-variant">{t("detailsAgent")}</dt>
            <dd className="text-on-surface">{conversation.agentName ?? t("detailsNoAgent")}</dd>
          </div>
          <div>
            <dt className="text-xs text-on-surface-variant">{t("detailsMessageCount")}</dt>
            <dd className="text-on-surface">{messages.length}</dd>
          </div>
        </dl>
      </div>
    </div>
  );
}
