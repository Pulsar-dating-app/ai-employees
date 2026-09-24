"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import clsx from "clsx";
import { ChevronRightIcon } from "@/components/ui/icons";
import { SettingsBlock } from "@/components/ui/settings-block";

// 2026-09-24 -- Scheduling settings' Google Calendar section when the
// business has several professionals: each connects their own calendar on
// their page, so this is a status overview with a link to each.
export function CalendarsSummaryBlock({
  professionals,
  available,
}: {
  professionals: { id: string; name: string; connected: boolean }[];
  available: boolean;
}) {
  const t = useTranslations("Scheduling.settings.googleCalendar");
  const tn = useTranslations("Scheduling.settings.nav");

  return (
    <SettingsBlock id="google-calendar" title={t("title")} description={t("multiSubtitle")}>
      {!available ? (
        <p className="text-sm text-on-surface-variant">{t("notConfigured")}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-outline-variant/40 border-y border-outline-variant/40">
          {professionals.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-3 py-3">
              <span className="truncate text-sm font-medium text-on-surface">{p.name}</span>
              <div className="flex shrink-0 items-center gap-3">
                <span
                  className={clsx(
                    "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-semibold",
                    p.connected ? "bg-success-100 text-success-500" : "bg-surface-container text-on-surface-variant",
                  )}
                >
                  <span
                    aria-hidden="true"
                    className={clsx("h-1.5 w-1.5 rounded-full", p.connected ? "bg-success-500" : "bg-outline")}
                  />
                  {p.connected ? tn("calendarConnected") : tn("calendarNotConnected")}
                </span>
                <Link
                  href={`/dashboard/scheduling/professionals/${p.id}#google-calendar`}
                  className="inline-flex items-center gap-1 text-[13px] font-semibold text-primary hover:underline"
                >
                  {t("manageLink")}
                  <ChevronRightIcon className="h-3.5 w-3.5" />
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </SettingsBlock>
  );
}
