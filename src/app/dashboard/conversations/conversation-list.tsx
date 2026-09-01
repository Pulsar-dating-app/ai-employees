"use client";

import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import clsx from "clsx";
import type { ConversationRow } from "@/lib/conversations/list";

const STATUS_STYLES: Record<string, string> = {
  paused: "bg-error-container text-on-error-container",
  active: "bg-secondary-container/40 text-on-secondary-container",
  closed: "bg-surface-container text-on-surface-variant",
};

const RELATIVE_UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 31536000],
  ["month", 2592000],
  ["week", 604800],
  ["day", 86400],
  ["hour", 3600],
  ["minute", 60],
];

function formatRelativeTime(iso: string, locale: string): string {
  const seconds = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  for (const [unit, secondsInUnit] of RELATIVE_UNITS) {
    if (seconds >= secondsInUnit) {
      return rtf.format(-Math.floor(seconds / secondsInUnit), unit);
    }
  }
  return rtf.format(0, "minute");
}

export function ConversationList({
  conversations,
  isLoading,
}: {
  conversations: ConversationRow[];
  isLoading: boolean;
}) {
  const t = useTranslations("Conversations");
  const locale = useLocale();
  const router = useRouter();

  if (conversations.length === 0 && !isLoading) {
    return <p className="py-6 text-sm text-on-surface-variant">{t("filters.emptyState")}</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-outline-variant text-on-surface-variant">
            <th className="py-2 pr-3 font-medium">{t("list.customerColumn")}</th>
            <th className="py-2 pr-3 font-medium">{t("list.statusColumn")}</th>
            <th className="py-2 pr-3 font-medium">{t("list.agentColumn")}</th>
            <th className="py-2 pr-3 font-medium">{t("list.updatedColumn")}</th>
          </tr>
        </thead>
        <tbody>
          {conversations.map((c) => (
            <tr
              key={c.id}
              role="button"
              tabIndex={0}
              onClick={() => router.push(`/dashboard/conversations/${c.id}`)}
              onKeyDown={(e) => {
                if (e.key === "Enter") router.push(`/dashboard/conversations/${c.id}`);
              }}
              className="cursor-pointer border-b border-outline-variant/60 hover:bg-surface-container-low"
            >
              <td className="py-3 pr-3">
                <div className="font-medium text-on-surface">{c.customer.displayName}</div>
                {c.lastMessage ? (
                  <div className="mt-0.5 max-w-md truncate text-on-surface-variant">{c.lastMessage.content}</div>
                ) : null}
              </td>
              <td className="py-3 pr-3">
                <span
                  className={clsx(
                    "inline-flex items-center rounded-full px-2 py-0.5 text-label-sm font-semibold",
                    STATUS_STYLES[c.status] ?? STATUS_STYLES.closed,
                  )}
                >
                  {t(`filters.status.${c.status}`)}
                </span>
              </td>
              <td className="py-3 pr-3 text-on-surface-variant">{c.agentName ?? t("list.noAgent")}</td>
              <td className="py-3 pr-3 text-on-surface-variant">{formatRelativeTime(c.updatedAt, locale)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
