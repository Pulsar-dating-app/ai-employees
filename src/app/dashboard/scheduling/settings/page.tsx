import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { PREDEFINED_INTAKE_FIELDS, PREDEFINED_INTAKE_KEYS } from "@/lib/appointments/intake-fields";
import { Button } from "@/components/ui/button";
import { StatusBanner } from "@/components/ui/status-banner";
import { BusinessHoursCard, type BusinessHourRow } from "./business-hours-card";
import { AppointmentControlsCard } from "./appointment-controls-card";
import { TimeOffCard, type TimeOffEntry } from "./time-off-card";
import { GoogleCalendarCard } from "./google-calendar-card";
import { IntakeQuestionsCard, type IntakeField } from "./intake-questions-card";
import { SchedulingSettingsShell } from "./settings-shell";
import { CalendarsSummaryBlock } from "./calendars-summary-block";
import { listProfessionals } from "@/lib/professionals/repository";

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
        <h1 className="text-headline-lg font-semibold tracking-tight text-on-surface">{t("pageTitle")}</h1>
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
  const [
    { data: membership },
    { data: businessHours },
    { data: timeOff },
    { data: intakeFields },
    { data: calendarConnections },
    professionals,
  ] = await Promise.all([
    supabase.from("company_users").select("role").eq("company_id", company.id).eq("user_id", user!.id).maybeSingle(),
    supabase
      .from("business_hours")
      .select("day_of_week, start_time, end_time, is_active")
      .eq("company_id", company.id)
      // The establishment's hours; professionals with their own schedule
      // are edited on their page (Scheduling > Professionals).
      .is("professional_id", null)
      .order("day_of_week", { ascending: true })
      .order("start_time", { ascending: true }),
    supabase
      .from("company_time_off")
      .select("id, start_date, end_date, reason")
      .eq("company_id", company.id)
      .is("professional_id", null)
      .gte("end_date", today)
      .order("start_date", { ascending: true }),
    supabase
      .from("appointment_intake_fields")
      .select("id, key, label, field_type, is_required, is_enabled, position")
      .eq("company_id", company.id)
      .order("position", { ascending: true }),
    supabase.from("company_calendar_connections").select("professional_id, status").eq("company_id", company.id),
    listProfessionals(supabase, company.id),
  ]);

  const canEdit = membership !== null;
  const isAdmin = ["owner", "admin"].includes(membership?.role ?? "");
  const googleClientId = process.env.GOOGLE_CLIENT_ID ?? null;

  const hourRows = (businessHours as BusinessHourRow[] | null) ?? [];
  const timeOffRows = (timeOff as TimeOffEntry[] | null) ?? [];
  const intakeRows = (intakeFields as IntakeField[] | null) ?? [];
  const openDays = new Set(hourRows.filter((r) => r.is_active).map((r) => r.day_of_week)).size;
  const requiresApproval = Boolean(company.requires_appointment_approval);
  const intakeByKey = new Map(intakeRows.map((f) => [f.key, f]));
  const intakeCount =
    PREDEFINED_INTAKE_FIELDS.filter((f) => intakeByKey.get(f.key)?.is_enabled ?? f.defaultEnabled).length +
    intakeRows.filter((f) => !PREDEFINED_INTAKE_KEYS.has(f.key)).length;
  // 2026-09-24 -- Google Calendar is per professional. With one
  // professional this screen keeps its original card (connecting that
  // professional); with several it summarises and links to each one's page.
  const connectedIds = new Set(
    ((calendarConnections ?? []) as { professional_id: string; status: string }[])
      .filter((c) => c.status === "connected")
      .map((c) => c.professional_id),
  );
  const connectedCount = professionals.filter((p) => connectedIds.has(p.id)).length;
  const calendarConnected = connectedCount > 0;
  const soleProfessional = professionals.length === 1 ? professionals[0] : null;
  const userId = user!.id;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="sr-only">{t("pageTitle")}</h1>
      <SchedulingSettingsShell
        banner={canEdit ? null : <StatusBanner tone="info" title={t("nav.readOnlyTitle")} body={t("readOnlyBanner")} />}
        initialStatuses={{
          "business-hours": {
            summary: openDays > 0 ? t("nav.hoursOpen", { count: openDays }) : t("nav.hoursClosed"),
            warn: openDays === 0,
          },
          "appointment-rules": { summary: requiresApproval ? t("nav.approvalOn") : t("nav.approvalOff"), warn: false },
          "time-off": {
            summary:
              timeOffRows.length === 0 ? t("nav.timeOffNone") : t("nav.timeOffCount", { count: timeOffRows.length }),
            warn: false,
          },
          "intake-questions": { summary: t("nav.intakeCount", { count: intakeCount }), warn: false },
          "google-calendar": {
            summary: !googleClientId
              ? t("nav.calendarUnavailable")
              : !soleProfessional
                ? t("nav.calendarsConnected", { connected: connectedCount, total: professionals.length })
                : calendarConnected
                  ? t("nav.calendarConnected")
                  : t("nav.calendarNotConnected"),
            warn: Boolean(googleClientId) && !calendarConnected,
          },
        }}
      >
        <BusinessHoursCard companyId={company.id} canEdit={canEdit} initialRows={hourRows} />
        <AppointmentControlsCard
          companyId={company.id}
          canEdit={canEdit}
          initialRequiresApproval={requiresApproval}
          initialMinLeadTimeMinutes={Number(company.min_lead_time_minutes) || 0}
          initialCancellationCutoffHours={Number(company.cancellation_cutoff_hours) || 0}
        />
        <TimeOffCard companyId={company.id} canEdit={canEdit} initialEntries={timeOffRows} />
        <IntakeQuestionsCard companyId={company.id} canEdit={canEdit} initialFields={intakeRows} />
        {soleProfessional ? (
          <GoogleCalendarCard
            companyId={company.id}
            professionalId={soleProfessional.id}
            canManage={isAdmin || soleProfessional.userId === userId}
            googleClientId={googleClientId}
          />
        ) : (
          <CalendarsSummaryBlock
            professionals={professionals.map((p) => ({ id: p.id, name: p.name, connected: connectedIds.has(p.id) }))}
            available={Boolean(googleClientId)}
          />
        )}
      </SchedulingSettingsShell>
    </div>
  );
}
