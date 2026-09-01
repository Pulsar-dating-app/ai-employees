import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { BusinessHoursCard, type BusinessHourRow } from "./business-hours-card";
import { AppointmentControlsCard } from "./appointment-controls-card";
import { TimeOffCard, type TimeOffEntry } from "./time-off-card";
import { GoogleCalendarCard } from "./google-calendar-card";

// The Scheduling area's settings screen (K5 sub-tab). Company-wide
// scheduling config, one card per concern:
//  - Business hours (K3, H2) — the weekly template, split shifts supported
//  - Appointment controls (K3, H3) — requires_appointment_approval
//  - Time off (K3 extension) — company_time_off one-off closures
//  - Google Calendar (K2, I1) — connect for live free/busy checks
// Reproduces the Stitch "Scheduling Settings" screen's main column; its
// right-hand rail ("Current Services" preview + persona card) is dropped as
// duplication / K4's territory (see decisions.md).
//
// No new API or schema here: every card sits on an already-shipped route
// (H2's business-hours PUT, B2's company PATCH, K3's time-off routes, I1's
// calendar connect/disconnect).
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
  // I1's calendar connect/disconnect routes are admin-only, so the K2 card
  // gates on this instead.
  const isAdmin = ["owner", "admin"].includes(membership?.role ?? "");

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
        <GoogleCalendarCard
          companyId={company.id}
          isAdmin={isAdmin}
          googleClientId={process.env.GOOGLE_CLIENT_ID ?? null}
        />
      </div>
    </div>
  );
}
