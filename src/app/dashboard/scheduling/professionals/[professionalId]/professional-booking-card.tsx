"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { SettingsBlock } from "@/components/ui/settings-block";
import { Toggle } from "@/components/ui/toggle";

// 2026-09-28 -- whether customers can book this professional. Off keeps the
// person (login, page, past appointments) but Ana stops offering them -- for
// an owner who only runs the place, say. Owners/admins only; refused like
// deactivating when it would leave nobody bookable or strand upcoming
// appointments.
export function ProfessionalBookingCard({
  companyId,
  professionalId,
  name,
  initialTakesBookings,
}: {
  companyId: string;
  professionalId: string;
  name: string;
  initialTakesBookings: boolean;
}) {
  const t = useTranslations("Scheduling.professionals");
  const router = useRouter();
  const [takesBookings, setTakesBookings] = useState(initialTakesBookings);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function change(next: boolean) {
    setSaving(true);
    setError(null);
    const res = await fetch(`/api/companies/${companyId}/professionals/${professionalId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ takesBookings: next }),
    }).catch(() => null);
    setSaving(false);
    if (!res?.ok) {
      const json = await res?.json().catch(() => null);
      setError(
        json?.error === "last_active_professional"
          ? t("lastActiveError")
          : json?.error === "has_upcoming_appointments"
            ? t("upcomingError", { count: json.count ?? 0 })
            : t("saveError"),
      );
      return;
    }
    setTakesBookings(next);
    router.refresh();
  }

  return (
    <SettingsBlock id="bookings" title={t("bookingsTitle")} description={t("bookingsSubtitle")}>
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-medium text-on-surface">{t("takesBookingsLabel")}</p>
          <p className="mt-0.5 text-[13px] text-on-surface-variant">
            {takesBookings ? t("takesBookingsOn", { name }) : t("takesBookingsOff", { name })}
          </p>
        </div>
        <Toggle checked={takesBookings} disabled={saving} onChange={change} label={t("takesBookingsLabel")} />
      </div>
      {error ? (
        <p role="alert" className="text-sm text-error">
          {error}
        </p>
      ) : null}
    </SettingsBlock>
  );
}
