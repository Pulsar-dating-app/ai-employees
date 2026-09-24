import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentAccess } from "@/lib/auth/company-access";
import { addDays, isValidTimeZone, localToday } from "@/lib/analytics/load";
import { zonedTimeToUtc } from "@/lib/availability/engine";
import { effectiveHours } from "@/lib/professionals/rules";
import { listProfessionals, loadAllHours } from "@/lib/professionals/repository";
import { defaultAgentName } from "@/lib/agents/naming";
import { resolveAgentPhoto } from "@/lib/agents/media";
import { Button } from "@/components/ui/button";
import { StatusBanner } from "@/components/ui/status-banner";
import { CalendarIcon } from "@/components/ui/icons";
import { LockedPage } from "../locked-page";
import { AppointmentsManager } from "./appointments-manager";
import { type SchedulingTeamMember } from "./today-panel";
import { APPOINTMENT_SELECT, type Appointment } from "./appointment-types";

const PAGE_SIZE = 20;
const PENDING_LIMIT = 20;
const ALERT_ACTION =
  "inline-flex min-h-10 items-center justify-center rounded-xl bg-surface-container-lowest px-4 text-label-md font-semibold text-on-surface ring-1 ring-outline-variant transition-[color,box-shadow] duration-150 hover:text-primary hover:ring-primary/40";

const SCHEDULING_AGENT_SLUG = "ana";

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

  const timezone = company.timezone && isValidTimeZone(company.timezone) ? company.timezone : "UTC";

  // "Today" is the business's calendar day, not the viewer's — a merchant
  // checking the schedule from another timezone still gets the shop's day,
  // with the real DST-aware midnight boundaries.
  const today = localToday(timezone);
  const dayStart = zonedTimeToUtc(today, "00:00", timezone).toISOString();
  const dayEnd = zonedTimeToUtc(addDays(today, 1), "00:00", timezone).toISOString();

  const weekday = new Date(`${today}T12:00:00Z`).getUTCDay();

  // 2026-09-25 -- a team member (role `member`) sees only their own
  // appointments, with no professional filter; RLS enforces the same. An
  // owner/admin who is also a professional opens on their own appointments
  // and can switch to everyone's.
  const access = await getCurrentAccess();
  const isMember = !access.isAdmin;
  const [allProfessionals, allHours] = await Promise.all([
    listProfessionals(supabase, company.id),
    loadAllHours(supabase, company.id),
  ]);
  const professionals = isMember ? allProfessionals.filter((p) => p.userId === user!.id) : allProfessionals;
  const ownProfessional = isMember
    ? (professionals[0] ?? null)
    : professionals.length > 1
      ? (professionals.find((p) => p.userId === user!.id) ?? null)
      : null;
  const scoped = <Q extends { eq: (column: string, value: string) => Q }>(query: Q): Q =>
    isMember && ownProfessional ? query.eq("professional_id", ownProfessional.id) : query;

  const upcomingQuery = supabase
    .from("appointments")
    .select(APPOINTMENT_SELECT, { count: "exact" })
    .eq("company_id", company.id)
    .gte("starts_at", dayStart);
  const [
    { data: membership },
    { data: appointments, count },
    { data: todayAppointments },
    { data: hired },
    { count: connectedCalendars },
    { data: pendingAppointments, count: pendingTotal },
  ] = await Promise.all([
    supabase.from("company_users").select("role").eq("company_id", company.id).eq("user_id", user!.id).maybeSingle(),
    (ownProfessional ? upcomingQuery.eq("professional_id", ownProfessional.id) : upcomingQuery)
      .order("starts_at", { ascending: true })
      .range(0, PAGE_SIZE - 1),
    scoped(
      supabase
        .from("appointments")
        .select(APPOINTMENT_SELECT)
        .eq("company_id", company.id)
        .gte("starts_at", dayStart)
        .lt("starts_at", dayEnd),
    ).order("starts_at", { ascending: true }),
    supabase
      .from("company_agents")
      .select("status, name, photo_type, photo_asset_url, agents(slug)")
      .eq("company_id", company.id),
    supabase
      .from("company_calendar_connections")
      .select("id", { count: "exact", head: true })
      .eq("company_id", company.id)
      .eq("status", "connected"),
    company.requires_appointment_approval
      ? scoped(
          supabase
            .from("appointments")
            .select(APPOINTMENT_SELECT, { count: "exact" })
            .eq("company_id", company.id)
            .eq("status", "requested"),
        )
          .order("starts_at", { ascending: true })
          .limit(PENDING_LIMIT)
      : Promise.resolve({ data: [] as Appointment[], count: 0 }),
  ]);

  const canEdit = membership !== null;
  // Everyone's working hours combined (each professional's own, or the
  // establishment's they inherit) -- today's timeline spans all of them.
  const hoursRows = professionals.flatMap((p) => effectiveHours(p, allHours));
  const toMinutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
  const todayRows = hoursRows.filter((row) => row.day_of_week === weekday);
  const todayHours =
    todayRows.length > 0
      ? {
          start: Math.min(...todayRows.map((row) => toMinutes(row.start_time))),
          end: Math.max(...todayRows.map((row) => toMinutes(row.end_time))),
        }
      : null;

  const calendarNotConnected = (connectedCalendars ?? 0) === 0 && Boolean(process.env.GOOGLE_CLIENT_ID);
  const businessHoursEmpty = hoursRows.length === 0;

  const settingsHref =
    isMember && ownProfessional
      ? `/dashboard/scheduling/professionals/${ownProfessional.id}`
      : "/dashboard/scheduling/settings";
  const alertItems = [
    businessHoursEmpty ? (
      <StatusBanner
        key="business-hours"
        tone="warn"
        title={t("alerts.businessHoursTitle")}
        body={t("alerts.businessHoursBody")}
        action={
          <Link href={`${settingsHref}#business-hours`} className={ALERT_ACTION}>
            {t("alerts.businessHoursAction")}
          </Link>
        }
      />
    ) : null,
    calendarNotConnected ? (
      <StatusBanner
        key="google-calendar"
        tone="info"
        title={t("alerts.calendarTitle")}
        body={t("alerts.calendarBody")}
        action={
          <Link href={`${settingsHref}#google-calendar`} className={ALERT_ACTION}>
            {t("alerts.calendarAction")}
          </Link>
        }
      />
    ) : null,
  ].filter(Boolean);

  const hiredRows = (hired ?? []) as unknown as {
    status: string;
    name: string | null;
    photo_type: string | null;
    photo_asset_url: string | null;
    agents: { slug: string } | null;
  }[];
  const schedulingRow = hiredRows.find((row) => row.agents?.slug === SCHEDULING_AGENT_SLUG);

  if (!schedulingRow) {
    const tl = await getTranslations("Dashboard.locked");
    const name = defaultAgentName(SCHEDULING_AGENT_SLUG);
    return (
      <LockedPage
        icon={CalendarIcon}
        pageTitle={t("pageTitle")}
        pageSubtitle={t("pageSubtitle")}
        title={tl("title", { name })}
        body={tl("body", { name })}
        ctaLabel={tl("cta", { name })}
        ctaHref={`/dashboard/agents/${SCHEDULING_AGENT_SLUG}`}
      />
    );
  }

  const teamMember: SchedulingTeamMember | null = schedulingRow.agents
    ? {
        name: schedulingRow.name ?? defaultAgentName(schedulingRow.agents.slug),
        photoSrc: resolveAgentPhoto(schedulingRow.agents.slug, schedulingRow.photo_type, schedulingRow.photo_asset_url),
        isActive: schedulingRow.status === "active",
      }
    : null;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="sr-only">{t("pageTitle")}</h1>
      {alertItems.length > 0 ? <div className="flex flex-col gap-3">{alertItems}</div> : null}
      <AppointmentsManager
        companyId={company.id}
        timezone={timezone}
        today={today}
        canEdit={canEdit}
        initialAppointments={(appointments ?? []) as Appointment[]}
        initialTotal={count ?? 0}
        pageSize={PAGE_SIZE}
        todayAppointments={(todayAppointments ?? []) as Appointment[]}
        pendingAppointments={(pendingAppointments ?? []) as Appointment[]}
        pendingTotal={pendingTotal ?? 0}
        hours={todayHours}
        hoursConfigured={!businessHoursEmpty}
        dayStart={dayStart}
        teamMember={teamMember}
        professionals={professionals.map((p) => ({ id: p.id, name: p.name }))}
        initialProfessionalId={ownProfessional?.id ?? ""}
      />
    </div>
  );
}
