"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import clsx from "clsx";
import { Button } from "@/components/ui/button";
import { SettingsBlock } from "@/components/ui/settings-block";
import { BusinessHoursCard, type BusinessHourRow } from "../../settings/business-hours-card";

const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];
const DAY_KEYS: Record<number, string> = {
  0: "sunday",
  1: "monday",
  2: "tuesday",
  3: "wednesday",
  4: "thursday",
  5: "friday",
  6: "saturday",
};

// A professional either follows the establishment's hours (the default) or
// has a schedule of their own. Switching to their own starts from a copy of
// the establishment's hours (the API does the copy); switching back leaves
// their saved schedule untouched in case they switch again.
export function ProfessionalHoursCard({
  companyId,
  professionalId,
  canManage,
  usesCustomHours,
  establishmentRows,
  ownRows,
}: {
  companyId: string;
  professionalId: string;
  canManage: boolean;
  usesCustomHours: boolean;
  establishmentRows: BusinessHourRow[];
  ownRows: BusinessHourRow[];
}) {
  const t = useTranslations("Scheduling.professionals");
  const tDays = useTranslations("Scheduling.settings.businessHours");
  const router = useRouter();
  const [switching, setSwitching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function setCustom(next: boolean) {
    setSwitching(true);
    setError(null);
    const res = await fetch(`/api/companies/${companyId}/professionals/${professionalId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ usesCustomHours: next }),
    }).catch(() => null);
    setSwitching(false);
    if (!res?.ok) {
      setError(t("saveError"));
      return;
    }
    router.refresh();
  }

  const switcher = canManage ? (
    <div className="flex flex-wrap items-center gap-3">
      {error ? (
        <p role="alert" className="text-sm text-error">
          {error}
        </p>
      ) : null}
      <Button type="button" variant="secondary" size="sm" isLoading={switching} onClick={() => setCustom(!usesCustomHours)}>
        {usesCustomHours ? t("useEstablishmentHours") : t("useOwnHours")}
      </Button>
    </div>
  ) : null;

  if (usesCustomHours) {
    return (
      <div className="flex flex-col gap-3">
        <BusinessHoursCard
          key={`own-${professionalId}`}
          companyId={companyId}
          canEdit={canManage}
          initialRows={ownRows}
          professionalId={professionalId}
          title={t("hoursTitle")}
          description={t("ownHoursSubtitle")}
        />
        {switcher}
      </div>
    );
  }

  const byDay = new Map<number, BusinessHourRow[]>();
  for (const row of establishmentRows.filter((r) => r.is_active)) {
    byDay.set(row.day_of_week, [...(byDay.get(row.day_of_week) ?? []), row]);
  }

  return (
    <SettingsBlock id="business-hours" title={t("hoursTitle")} description={t("inheritedHoursSubtitle")}>
      {establishmentRows.length === 0 ? (
        <p className="text-sm text-on-surface-variant">{t("noEstablishmentHours")}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-outline-variant/40 border-y border-outline-variant/40">
          {DAY_ORDER.map((dow) => {
            const windows = byDay.get(dow) ?? [];
            return (
              <li key={dow} className="flex items-center justify-between py-2.5 text-sm">
                <span className={clsx("font-medium", windows.length ? "text-on-surface" : "text-on-surface-variant")}>
                  {tDays(`days.${DAY_KEYS[dow]}`)}
                </span>
                <span className="tabular-nums text-on-surface-variant">
                  {windows.length
                    ? windows.map((w) => `${w.start_time.slice(0, 5)}–${w.end_time.slice(0, 5)}`).join(", ")
                    : tDays("closed")}
                </span>
              </li>
            );
          })}
        </ul>
      )}
      {switcher}
    </SettingsBlock>
  );
}
