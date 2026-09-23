"use client";

import { useLocale, useTranslations } from "next-intl";
import clsx from "clsx";
import { CartIcon, ClockIcon, XIcon } from "@/components/ui/icons";
import { channelLabel } from "@/lib/conversations/channel-label";
import type { ConversationRow } from "@/lib/conversations/list";
import { AgentAvatar, ChannelGlyph, CustomerAvatar } from "./customer-avatar";
import { formatFullDate } from "./inbox-format";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <dt className="text-[13px] text-on-surface-variant">{label}</dt>
      <dd className="flex min-w-0 items-center gap-2 text-right text-[13px] font-medium text-on-surface">{children}</dd>
    </div>
  );
}

export function ConversationDetails({
  open,
  onClose,
  customerSeed,
  customerName,
  channel,
  status,
  agentName,
  agentPhotoSrc,
  createdAt,
  lastActivity,
  messageCount,
  row,
}: {
  open: boolean;
  onClose: () => void;
  customerSeed: string;
  customerName: string;
  channel: string;
  status: string;
  agentName: string | null;
  agentPhotoSrc: string | null;
  createdAt: string | null;
  lastActivity: string | null;
  messageCount: number | null;
  row: ConversationRow | undefined;
}) {
  const t = useTranslations("Conversations");
  const locale = useLocale();

  if (!open) return null;

  const hasSignals = Boolean(row?.pendingConfirmation || row?.hotSignal);

  return (
    <div className="absolute inset-0 z-30 flex justify-end">
      <button
        type="button"
        aria-label={t("inbox.details.close")}
        onClick={onClose}
        className="inbox-scrim-in absolute inset-0 bg-on-surface/5"
      />
      <aside
        role="dialog"
        aria-label={t("inbox.details.title")}
        className="inbox-drawer-in chat-scroll relative flex h-full w-full max-w-sm flex-col overflow-y-auto border-l border-outline-variant/60 bg-surface-container-lowest shadow-[-12px_0_40px_-12px_rgba(25,28,29,0.18)]"
      >
        <div className="flex items-center justify-between px-5 pt-4">
          <h3 className="text-[13px] font-semibold text-on-surface-variant">{t("inbox.details.title")}</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("inbox.details.close")}
            className="flex h-8 w-8 items-center justify-center rounded-full text-on-surface-variant transition-colors hover:bg-surface-container"
          >
            <XIcon className="h-4 w-4" />
          </button>
        </div>

        <div className="flex flex-col items-center gap-3 px-5 pb-6 pt-4 text-center">
          <CustomerAvatar seed={customerSeed} name={customerName || "?"} channel={channel} size="lg" />
          <p className="text-base font-semibold text-on-surface">{customerName}</p>
        </div>

        <dl className="mx-5 divide-y divide-outline-variant/50 border-y border-outline-variant/50">
          <Field label={t("inbox.details.channel")}>
            <ChannelGlyph channel={channel} className="h-4 w-4" />
            {channelLabel(t, channel)}
          </Field>
          <Field label={t("inbox.details.handledBy")}>
            {agentName ? (
              <>
                <AgentAvatar photoSrc={agentPhotoSrc} name={agentName} className="h-6 w-6" />
                {agentName}
              </>
            ) : (
              t("inbox.details.noAgent")
            )}
          </Field>
          <Field label={t("inbox.details.status")}>
            {t(`inbox.thread.status.${status === "active" || status === "paused" ? status : "closed"}`, {
              name: agentName ?? t("inbox.thread.teamFallback"),
            })}
          </Field>
          {createdAt ? <Field label={t("inbox.details.started")}>{formatFullDate(createdAt, locale)}</Field> : null}
          {lastActivity ? (
            <Field label={t("inbox.details.lastActivity")}>{formatFullDate(lastActivity, locale)}</Field>
          ) : null}
          {messageCount !== null ? (
            <Field label={t("inbox.details.messages")}>
              <span className="tabular-nums">{messageCount}</span>
            </Field>
          ) : null}
        </dl>

        <div className="px-5 py-6">
          <h4 className="text-[13px] font-semibold text-on-surface-variant">{t("inbox.details.signals")}</h4>
          {hasSignals ? (
            <ul className="mt-3 flex flex-col gap-2">
              {row?.pendingConfirmation ? (
                <li className="flex items-center gap-3 rounded-xl bg-primary-fixed/60 px-3 py-2.5 text-[13px] font-medium text-primary">
                  <ClockIcon className="h-4 w-4 shrink-0" />
                  {t("pending.rowBadge")}
                </li>
              ) : null}
              {row?.hotSignal ? (
                <li
                  className={clsx(
                    "flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-medium",
                    row.hotSignal === "checkout_click"
                      ? "bg-success-100 text-success-500"
                      : "bg-success-100/60 text-success-500",
                  )}
                >
                  <CartIcon className="h-4 w-4 shrink-0" />
                  {t(row.hotSignal === "checkout_click" ? "hot.rowBadgeClick" : "hot.rowBadgeIntent")}
                </li>
              ) : null}
            </ul>
          ) : (
            <p className="mt-2 text-[13px] text-outline">{t("inbox.details.noSignals")}</p>
          )}
        </div>
      </aside>
    </div>
  );
}
