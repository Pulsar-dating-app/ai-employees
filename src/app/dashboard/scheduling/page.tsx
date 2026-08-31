import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { addDays, isValidTimeZone, localToday } from "@/lib/analytics/load";
import { zonedTimeToUtc } from "@/lib/availability/engine";
import { defaultAgentName } from "@/lib/agents/naming";
import { agentPhoto } from "@/lib/agents/media";
import { Button } from "@/components/ui/button";
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
    supabase.from("company_agents").select("status, agents(slug)").eq("company_id", company.id),
  ]);

  const canEdit = membership !== null;

  // PostgREST returns `agents` as one embedded object for this to-one
  // relation; the generated types widen it to an array (same cast the
  // metrics, my-agents and dashboard-layout reads already make).
  const hiredRows = (hired ?? []) as unknown as {
    status: string;
    agents: { slug: string } | null;
  }[];
  const schedulingRow = hiredRows.find((row) => row.agents?.slug === SCHEDULING_AGENT_SLUG);
  const teamMember: SchedulingTeamMember | null = schedulingRow?.agents
    ? {
        name: defaultAgentName(schedulingRow.agents.slug),
        photoSrc: agentPhoto(schedulingRow.agents.slug),
        isActive: schedulingRow.status === "active",
      }
    : null;

  return (
    <AppointmentsManager
      companyId={company.id}
      timezone={timezone}
      today={today}
      canEdit={canEdit}
      initialAppointments={appointments ?? []}
      initialTotal={count ?? 0}
      pageSize={PAGE_SIZE}
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
