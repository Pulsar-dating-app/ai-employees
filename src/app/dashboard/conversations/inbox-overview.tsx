"use client";

import { useLocale, useTranslations } from "next-intl";
import { ArrowRightIcon, CartIcon, ChevronRightIcon } from "@/components/ui/icons";
import type { ConversationRow } from "@/lib/conversations/list";
import { AgentAvatar, CustomerAvatar } from "./customer-avatar";
import { formatListTime, groupOf } from "./inbox-format";

const MAX_WAITING_CARDS = 3;

function WaitingCard({ row, index, onOpen }: { row: ConversationRow; index: number; onOpen: (id: string) => void }) {
  const t = useTranslations("Conversations.inbox");
  const locale = useLocale();
  const last = row.lastMessage;
  const prefix = last?.role === "merchant" ? t("you") : last?.role === "agent" ? row.agentName : null;

  return (
    <div className="inbox-face-in" style={{ "--i": index } as React.CSSProperties}>
      <button
        type="button"
        onClick={() => onOpen(row.id)}
        className="group flex w-full items-center gap-4 rounded-2xl bg-surface-container-lowest px-4 py-3.5 text-left shadow-[0_1px_2px_rgba(25,28,29,0.05),0_10px_28px_-14px_rgba(53,37,205,0.3)] ring-1 ring-outline-variant/50 transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-[0_1px_2px_rgba(25,28,29,0.05),0_16px_36px_-14px_rgba(53,37,205,0.4)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        <CustomerAvatar seed={row.customer.id} name={row.customer.displayName} channel={row.channel} />
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline justify-between gap-3">
            <span className="truncate text-sm font-semibold text-on-surface">{row.customer.displayName}</span>
            <span className="shrink-0 text-[11px] tabular-nums text-outline">
              {formatListTime(last?.created_at ?? row.updatedAt, locale, t("yesterday"))}
            </span>
          </span>
          <span className="mt-0.5 line-clamp-1 text-[13px] text-on-surface-variant">
            {prefix ? <span className="font-medium text-on-surface">{prefix}: </span> : null}
            {last?.content ?? ""}
          </span>
        </span>
        <ChevronRightIcon className="h-4 w-4 shrink-0 text-outline transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-primary" />
      </button>
    </div>
  );
}

export function InboxOverview({ rows, onOpen }: { rows: ConversationRow[]; onOpen: (id: string) => void }) {
  const t = useTranslations("Conversations.inbox");

  const needsYou = rows.filter((row) => groupOf(row) === "needsYou");
  const hot = rows.filter((row) => groupOf(row) === "hot");
  const first = hot[0] ?? rows[0];

  const team = new Map<string, string | null>();
  for (const row of rows) {
    if (row.agentName && !team.has(row.agentName)) team.set(row.agentName, row.agentPhotoSrc);
  }
  const faces = [...team.entries()].slice(0, 3);

  const hotPill =
    hot.length > 0 ? (
      <p className="inline-flex items-center gap-2 rounded-full bg-success-100 px-3 py-1 text-[12px] font-semibold text-success-500">
        <CartIcon className="h-3.5 w-3.5" />
        {t("overview.hot", { count: hot.length })}
      </p>
    ) : null;

  return (
    <div className="chat-scroll relative flex h-full flex-col items-center overflow-y-auto bg-surface px-8 py-10">
      <div
        aria-hidden="true"
        className="inbox-overview-glow pointer-events-none absolute left-1/2 top-1/2 h-[30rem] w-[30rem] rounded-full"
      />

      <div className="relative my-auto flex w-full max-w-md flex-col items-center text-center">
        {rows.length === 0 ? (
          <>
            <h2 className="text-headline-md font-semibold tracking-tight text-on-surface">{t("empty.title")}</h2>
            <p className="mt-2 max-w-sm text-sm leading-6 text-on-surface-variant">{t("empty.body")}</p>
          </>
        ) : needsYou.length > 0 ? (
          <>
            <h2 className="text-balance text-headline-md font-semibold tracking-tight text-on-surface">
              {t("overview.needsYou", { count: needsYou.length })}
            </h2>
            <p className="mt-2 text-balance text-sm leading-6 text-on-surface-variant">{t("overview.needsYouBody")}</p>
            <div className="mt-7 flex w-full flex-col gap-2.5">
              {needsYou.slice(0, MAX_WAITING_CARDS).map((row, i) => (
                <WaitingCard key={row.id} row={row} index={i} onOpen={onOpen} />
              ))}
            </div>
            {hotPill ? <div className="mt-6">{hotPill}</div> : null}
          </>
        ) : (
          <>
            {faces.length > 0 ? (
              <div className="mb-7 flex -space-x-3">
                {faces.map(([name, photo], i) => (
                  <span
                    key={name}
                    className="inbox-face-in rounded-full ring-4 ring-surface"
                    style={{ "--i": i } as React.CSSProperties}
                  >
                    <AgentAvatar photoSrc={photo} name={name} className="h-16 w-16" />
                  </span>
                ))}
              </div>
            ) : null}
            <h2 className="text-balance text-headline-md font-semibold tracking-tight text-on-surface">
              {t("overview.caughtUp")}
            </h2>
            <p className="mt-2 text-balance text-sm leading-6 text-on-surface-variant">{t("overview.caughtUpBody")}</p>
            {hotPill ? <div className="mt-4">{hotPill}</div> : null}
            {first ? (
              <button
                type="button"
                onClick={() => onOpen(first.id)}
                className="group mt-7 inline-flex h-11 items-center gap-2 rounded-full bg-primary px-5 text-sm font-semibold text-on-primary shadow-[0_8px_20px_-8px_rgba(53,37,205,0.6)] transition-[transform,filter] duration-200 hover:brightness-110 active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              >
                {t("overview.openFirst")}
                <ArrowRightIcon className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
              </button>
            ) : null}
          </>
        )}
        {rows.length > 0 ? <p className="mt-6 text-[11px] text-outline">{t("overview.keyboard")}</p> : null}
      </div>
    </div>
  );
}
