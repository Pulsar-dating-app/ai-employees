import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { addDays, isValidTimeZone, localToday } from "@/lib/analytics/load";
import { zonedTimeToUtc } from "@/lib/availability/engine";
import { defaultAgentName } from "@/lib/agents/naming";
import { resolveAgentPhoto } from "@/lib/agents/media";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { CalendarIcon } from "@/components/ui/icons";
import { LockedPage } from "../locked-page";
import { AppointmentsManager } from "./appointments-manager";
import { AppointmentsSummary, type SchedulingTeamMember } from "./appointments-summary";
import { APPOINTMENT_SELECT } from "./appointment-types";

const PAGE_SIZE = 20;

// The team member this screen is about — the rail's persona card is the
// scheduling one, not whoever happens to be hired first.
const SCHEDULING_AGENT_SLUG = "ana";

// Trello K4 — the merchant's view of what Ana has booked. H3 owns the data
// and the mutations; this only reads and drives PATCHes.
//
// Built to match the Stitch "Bookings & Appointments Dashboard" screen
// element for element: header with the scope toggle on the right, a column
// of booking cards at `lg:col-span-8`, and the two-card rail at
// `lg:col-span-4`. The header lives inside <AppointmentsManager> because the
// toggle is client state and that screen puts it above the whole grid; the
// rail is server-rendered here and passed down as a prop.
//
// Approve/decline on `requested` rows and the "N awaiting approval" chip are
// K7. Decline is a `cancelled` PATCH carrying a `cancellation_reason`, not a
// status of its own.
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

  // Same fallback every other timezone-aware read in this app uses
  // (availability/load.ts, analytics/load.ts, H3's own business-hours check).
  const timezone = company.timezone && isValidTimeZone(company.timezone) ? company.timezone : "UTC";

  // "Today" is the business's calendar day, not the viewer's — a merchant
  // checking the schedule from another timezone still gets the shop's day,
  // with the real DST-aware midnight boundaries.
  const today = localToday(timezone);
  const dayStart = zonedTimeToUtc(today, "00:00", timezone).toISOString();
  const dayEnd = zonedTimeToUtc(addDays(today, 1), "00:00", timezone).toISOString();

  // Default view is "upcoming": soonest first, from now on. The manager
  // re-fetches through the API for every other scope/status combination.
  const nowIso = new Date().toISOString();
  const [
    { data: membership },
    { data: appointments, count },
    { count: bookedToday },
    { count: completedToday },
    { data: hired },
    { data: calendarConnection },
    { count: pendingRequested },
    { count: businessHoursCount },
  ] = await Promise.all([
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
    // head: true — these two only ever render as a number, so there's no
    // reason to ship the rows alongside the count.
    supabase
      .from("appointments")
      .select("id", { count: "exact", head: true })
      .eq("company_id", company.id)
      .gte("starts_at", dayStart)
      .lt("starts_at", dayEnd)
      .neq("status", "cancelled"),
    supabase
      .from("appointments")
      .select("id", { count: "exact", head: true })
      .eq("company_id", company.id)
      .gte("starts_at", dayStart)
      .lt("starts_at", dayEnd)
      .eq("status", "completed"),
    supabase
      .from("company_agents")
      .select("status, name, photo_type, photo_asset_url, agents(slug)")
      .eq("company_id", company.id),
    supabase
      .from("company_calendar_connections")
      .select("status")
      .eq("company_id", company.id)
      .maybeSingle(),
    // K7: count of bookings still waiting on the merchant's approval. Only
    // surfaced when the approval toggle is on — otherwise nothing ever lands
    // in `requested` and the chip would be dead weight.
    supabase
      .from("appointments")
      .select("id", { count: "exact", head: true })
      .eq("company_id", company.id)
      .eq("status", "requested"),
    // Missing-config alert (below): a company with no configured open day
    // at all still lets Ana book blind — worth flagging up front rather than
    // only discoverable by opening Settings and finding an empty section.
    // (Intake questions are always configured now — R2 seeds a required
    // email for every company — so there's no "empty intake" alert.)
    supabase
      .from("business_hours")
      .select("id", { count: "exact", head: true })
      .eq("company_id", company.id)
      .eq("is_active", true),
  ]);

  const canEdit = membership !== null;
  const pendingCount = company.requires_appointment_approval ? (pendingRequested ?? 0) : 0;

  // Google Calendar isn't connected yet, and the workspace *can* connect it
  // (credentials configured) — same gate the old rail nudge card used.
  const calendarNotConnected =
    (calendarConnection as { status?: string } | null)?.status !== "connected" &&
    Boolean(process.env.GOOGLE_CLIENT_ID);
  const businessHoursEmpty = (businessHoursCount ?? 0) === 0;

  // Missing-config alerts, top of page — replaces the old calendar-only rail
  // nudge card (appointments-summary.tsx) with one consistent set covering
  // all three "Ana can't do her job well without this" gaps. Business
  // hours/intake are `warning` (booking correctness is actually at risk
  // without them — Ana has no hours to check availability against, or
  // skips questions the merchant wanted asked); Calendar is `info` per the
  // user's own call — connecting it is a real improvement (live conflict
  // checking) but Ana still books correctly without it using the in-app
  // hours/appointments alone, so it doesn't carry the same "something is
  // actually wrong" weight as the other two.
  const alerts =
    businessHoursEmpty || calendarNotConnected ? (
      <div className="mb-6 flex flex-col gap-3">
        {businessHoursEmpty ? (
          <Alert
            variant="warning"
            title={t("alerts.businessHoursTitle")}
            action={
              <Link href="/dashboard/scheduling/settings#business-hours" className="text-sm font-semibold underline">
                {t("alerts.businessHoursAction")}
              </Link>
            }
          >
            {t("alerts.businessHoursBody")}
          </Alert>
        ) : null}
        {calendarNotConnected ? (
          <Alert
            variant="info"
            title={t("alerts.calendarTitle")}
            action={
              <Link href="/dashboard/scheduling/settings#google-calendar" className="text-sm font-semibold underline">
                {t("alerts.calendarAction")}
              </Link>
            }
          >
            {t("alerts.calendarBody")}
          </Alert>
        ) : null}
      </div>
    ) : null;

  // PostgREST returns `agents` as one embedded object for this to-one
  // relation; the generated types widen it to an array (same cast the
  // metrics, my-agents and dashboard-layout reads already make).
  const hiredRows = (hired ?? []) as unknown as {
    status: string;
    name: string | null;
    photo_type: string | null;
    photo_asset_url: string | null;
    agents: { slug: string } | null;
  }[];
  const schedulingRow = hiredRows.find((row) => row.agents?.slug === SCHEDULING_AGENT_SLUG);

  // Scheduling exists to serve Ana — with her not hired there are no
  // bookings to manage. The tab stays visible; this is where it lands.
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

  const teamMember: SchedulingTeamMember | null = schedulingRow?.agents
    ? {
        name: schedulingRow.name ?? defaultAgentName(schedulingRow.agents.slug),
        photoSrc: resolveAgentPhoto(
          schedulingRow.agents.slug,
          schedulingRow.photo_type,
          schedulingRow.photo_asset_url,
        ),
        isActive: schedulingRow.status === "active",
      }
    : null;

  return (
    <AppointmentsManager
      companyId={company.id}
      timezone={timezone}
      today={today}
      canEdit={canEdit}
      pendingCount={pendingCount}
      initialAppointments={appointments ?? []}
      initialTotal={count ?? 0}
      pageSize={PAGE_SIZE}
      alerts={alerts}
      summary={
        <AppointmentsSummary
          bookedToday={bookedToday ?? 0}
          completedToday={completedToday ?? 0}
          teamMember={teamMember}
        />
      }
    />
  );
}
