import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { isValidTimeZone } from "@/lib/analytics/load";
import { Button } from "@/components/ui/button";
import { CalendarIcon } from "@/components/ui/icons";
import { PageHeader } from "../page-header";
import { AppointmentsManager } from "./appointments-manager";
import { APPOINTMENT_SELECT } from "./appointment-types";

const PAGE_SIZE = 20;

// Trello K4 — the merchant's view of what Ana has booked. H3 owns the data
// and the mutations; this only reads and drives PATCHes.
//
// Deliberately no approve/decline on `requested` rows — that's K7, which
// also has to record a cancellation_reason on decline. Cancel is available
// here because it's the same plain status change every other row gets.
export default async function AppointmentsPage() {
  const supabase = await createClient();
  const t = await getTranslations("Scheduling.appointments");

  const [
    {
      data: { user },
    },
    { data: companies },
  ] = await Promise.all([supabase.auth.getUser(), supabase.from("companies").select("*")]);
  const company = companies?.[0] ?? null;

  if (!company) {
    return (
      <div className="flex flex-col gap-4">
        <PageHeader icon={CalendarIcon} title={t("pageTitle")} subtitle={t("pageSubtitle")} />
        <p className="text-sm text-on-surface-variant">{t("noCompany")}</p>
        <Link href="/dashboard">
          <Button type="button">{t("browseMarketplace")}</Button>
        </Link>
      </div>
    );
  }

  // Same fallback every other timezone-aware read in this app uses
  // (availability/load.ts, analytics/load.ts, H3's own business-hours check).
  const timezone = company.timezone && isValidTimeZone(company.timezone) ? company.timezone : "UTC";

  // Default view is "upcoming": soonest first, from now on. The manager
  // re-fetches through the API for every other scope/status combination.
  const nowIso = new Date().toISOString();
  const [{ data: membership }, { data: appointments, count }] = await Promise.all([
    supabase
      .from("company_users")
      .select("role")
      .eq("company_id", company.id)
      .eq("user_id", user!.id)
      .maybeSingle(),
    supabase
      .from("appointments")
      .select(APPOINTMENT_SELECT, { count: "exact" })
      .eq("company_id", company.id)
      .gte("starts_at", nowIso)
      .order("starts_at", { ascending: true })
      .range(0, PAGE_SIZE - 1),
  ]);

  const canEdit = membership !== null;

  return (
    <div className="flex flex-col gap-8">
      <PageHeader icon={CalendarIcon} title={t("pageTitle")} subtitle={t("pageSubtitle")} />

      {!canEdit ? (
        <p className="rounded-md border border-outline-variant bg-surface-container px-3 py-2 text-sm text-on-surface-variant">
          {t("readOnlyBanner")}
        </p>
      ) : null}

      <AppointmentsManager
        companyId={company.id}
        timezone={timezone}
        canEdit={canEdit}
        initialAppointments={appointments ?? []}
        initialTotal={count ?? 0}
        pageSize={PAGE_SIZE}
      />
    </div>
  );
}
