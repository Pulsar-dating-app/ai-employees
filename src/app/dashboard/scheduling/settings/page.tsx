import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { BusinessHoursCard, type BusinessHourRow } from "./business-hours-card";
import { AppointmentControlsCard } from "./appointment-controls-card";
import { TimeOffCard, type TimeOffEntry } from "./time-off-card";

// Trello K3 — the merchant-facing UI for H2 (business_hours) and H3's
// companies.requires_appointment_approval flag. A third sub-tab of the
// Scheduling area (K5), sitting beside Services because both are
// scheduling-specific settings rather than general business facts.
//
// Reproduces the Stitch "Scheduling Settings - Business Hours & Approvals"
// screen's two main-column cards. The mock's right-hand rail is dropped:
// its "Current Services" preview duplicates the Services sub-tab one click
// away, and its persona identity card is K4's (the Appointments screen
// already carries the scheduling persona rail) and isn't part of this
// ticket's scope. See decisions.md.
//
// No new API and no schema change: GET/PUT /api/companies/[id]/business-hours
// (H2, whole-week replace) and PATCH /api/companies/[id] (B2) already exist.
export default async function SchedulingSettingsPage() {
  const supabase = await createClient();
  const t = await getTranslations("Scheduling.settings");

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
        <h1 className="text-headline-lg font-semibold tracking-tight text-on-surface">
          {t("pageTitle")}
        </h1>
        <p className="text-body-md text-on-surface-variant">{t("noCompany")}</p>
        <Link href="/dashboard">
          <Button type="button" className="self-start">
            {t("browseMarketplace")}
          </Button>
        </Link>
      </div>
    );
  }

  const today = new Date().toISOString().slice(0, 10);
  const [{ data: membership }, { data: businessHours }, { data: timeOff }] = await Promise.all([
    supabase
      .from("company_users")
      .select("role")
      .eq("company_id", company.id)
      .eq("user_id", user!.id)
      .maybeSingle(),
    supabase
      .from("business_hours")
      .select("day_of_week, start_time, end_time, is_active")
      .eq("company_id", company.id)
      .order("day_of_week", { ascending: true })
      .order("start_time", { ascending: true }),
    supabase
      .from("company_time_off")
      .select("id, start_date, end_date, reason")
      .eq("company_id", company.id)
      .gte("end_date", today)
      .order("start_date", { ascending: true }),
  ]);

  // H2's routes only ever call requireMember, so — like Services (K1) —
  // gating the UI on admin would invent a restriction the API doesn't have.
  const canEdit = membership !== null;

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-headline-lg font-semibold tracking-tight text-on-surface">
          {t("pageTitle")}
        </h1>
        <p className="mt-1 max-w-2xl text-body-md text-on-surface-variant">{t("pageSubtitle")}</p>
      </div>

      {!canEdit ? (
        <p className="rounded-md border border-outline-variant bg-surface-container px-3 py-2 text-sm text-on-surface-variant">
          {t("readOnlyBanner")}
        </p>
      ) : null}

      <div className="flex max-w-3xl flex-col gap-8">
        <BusinessHoursCard
          companyId={company.id}
          canEdit={canEdit}
          initialRows={(businessHours as BusinessHourRow[] | null) ?? []}
        />
        <AppointmentControlsCard
          companyId={company.id}
          canEdit={canEdit}
          initialRequiresApproval={Boolean(company.requires_appointment_approval)}
        />
        <TimeOffCard
          companyId={company.id}
          canEdit={canEdit}
          initialEntries={(timeOff as TimeOffEntry[] | null) ?? []}
        />
      </div>
    </div>
  );
}
