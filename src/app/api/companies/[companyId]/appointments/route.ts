import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checkCompanyRole } from "@/lib/auth/company-access";
import { syncAppointmentConfirmed, calendarVisibleEndsAt } from "@/lib/google-calendar/appointment-sync";
import { isValidTimeZone } from "@/lib/analytics/load";
import {
  fitsProfessionalSchedule,
  listProfessionals,
  resolveProfessionalForService,
} from "@/lib/professionals/repository";

// 2026-09-25 -- a team member (role `member`) lists and books only on
// their own professional's schedule; RLS enforces the same.
//
// Trello H3 — appointments CRUD, scoped to company_id. The booking record
// behind Ana's scheduling tools (Trello J3) and the dashboard's Appointments
// view (Trello K4). Google Calendar sync (Trello I3) hooks in below: a
// newly `confirmed` appointment gets a Google event; a `requested` one
// (pending manual approval) does not, until a later PATCH confirms it.


const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;
const VALID_STATUSES = ["requested", "confirmed", "cancelled", "completed", "no_show"] as const;

function parsePositiveInt(value: string | null, fallback: number, max?: number): number {
  const parsed = value === null ? NaN : Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) return fallback;
  return max ? Math.min(parsed, max) : parsed;
}

// GET: list appointments for the company. Defaults to soonest-first, since
// this is forward-looking scheduling data (unlike products'/services'
// created_at-desc catalog ordering). ?status=/&from=/&to= (both ISO
// datetimes, filtering on starts_at) /&page=/&pageSize= are all optional.
//
// Extended by K4 (the Appointments view), the way F3 extended B3's products
// list for the same reason — the shipped shape couldn't render a useful
// screen:
//   - embeds `services(name)` / `customers(name, phone)`, since a bare
//     service_id/customer_id is unreadable in a list. Both are to-one, so
//     PostgREST returns an object (or null — service_id is nullable and
//     survives a service being soft-deleted).
//   - `?order=desc` flips to latest-first, which is what "past bookings"
//     needs; ascending stays the default for the forward-looking case.
// (`?status=` was already validated against VALID_STATUSES here — left as is.)
// 2026-09-24: `?professionalId=` narrows to one professional's schedule, and
// `professionals(name)` is embedded so the list can say who each one is with.
export async function GET(
  request: Request,
  { params }: { params: Promise<{ companyId: string }> },
) {
  const { companyId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const memberCheck = await checkCompanyRole(supabase, companyId, user.id, "member");
  if (memberCheck.error) return memberCheck.error;

  const searchParams = new URL(request.url).searchParams;
  const status = searchParams.get("status");
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const professionalId = memberCheck.isAdmin
    ? searchParams.get("professionalId")
    : (memberCheck.ownProfessionalId ?? "00000000-0000-0000-0000-000000000000");
  const ascending = searchParams.get("order") !== "desc";
  const page = parsePositiveInt(searchParams.get("page"), 1);
  const pageSize = parsePositiveInt(searchParams.get("pageSize"), DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);

  if (status && !VALID_STATUSES.includes(status as (typeof VALID_STATUSES)[number])) {
    return NextResponse.json(
      { error: `status must be one of: ${VALID_STATUSES.join(", ")}` },
      { status: 400 },
    );
  }

  let query = supabase
    .from("appointments")
    .select("*, services(name), customers(name, phone), professionals(name)", { count: "exact" })
    .eq("company_id", companyId);
  if (status) query = query.eq("status", status);
  if (professionalId) query = query.eq("professional_id", professionalId);
  if (from) query = query.gte("starts_at", from);
  if (to) query = query.lte("starts_at", to);

  const fromIndex = (page - 1) * pageSize;
  const { data, error, count } = await query
    .order("starts_at", { ascending })
    .range(fromIndex, fromIndex + pageSize - 1);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ appointments: data, total: count ?? 0, page, pageSize });
}

// POST: book an appointment. service_id/customer_id/starts_at are required;
// ends_at is always computed server-side from the service's duration +
// buffer, never trusted from the client. status is decided server-side from
// companies.requires_appointment_approval, never trusted from the client
// either — both are "grounded" the same way Malu's tools never let the
// model assert a price.
//
// 2026-09-24: `professional_id` says whose schedule the booking goes on. It
// may be omitted only while the company has a single active professional.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ companyId: string }> },
) {
  const { companyId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const memberCheck = await checkCompanyRole(supabase, companyId, user.id, "member");
  if (memberCheck.error) return memberCheck.error;

  const body = await request.json().catch(() => null);

  if (!memberCheck.isAdmin) {
    const requested = typeof body?.professional_id === "string" ? body.professional_id : null;
    if (!memberCheck.ownProfessionalId || (requested && requested !== memberCheck.ownProfessionalId)) {
      return NextResponse.json({ error: "You can only book on your own schedule" }, { status: 403 });
    }
    if (body && typeof body === "object") body.professional_id = memberCheck.ownProfessionalId;
  }

  const serviceId = typeof body?.service_id === "string" ? body.service_id : "";
  if (!serviceId) {
    return NextResponse.json({ error: "service_id is required" }, { status: 400 });
  }

  const customerId = typeof body?.customer_id === "string" ? body.customer_id : "";
  if (!customerId) {
    return NextResponse.json({ error: "customer_id is required" }, { status: 400 });
  }

  const startsAtRaw = typeof body?.starts_at === "string" ? body.starts_at : "";
  const startsAt = startsAtRaw ? new Date(startsAtRaw) : null;
  if (!startsAt || Number.isNaN(startsAt.getTime())) {
    return NextResponse.json({ error: "starts_at must be a valid ISO datetime string" }, { status: 400 });
  }

  if (body?.conversation_id !== undefined && body.conversation_id !== null && typeof body.conversation_id !== "string") {
    return NextResponse.json({ error: "conversation_id must be a string" }, { status: 400 });
  }
  if (body?.agent_id !== undefined && body.agent_id !== null && typeof body.agent_id !== "string") {
    return NextResponse.json({ error: "agent_id must be a string" }, { status: 400 });
  }
  if (body?.notes !== undefined && body.notes !== null && typeof body.notes !== "string") {
    return NextResponse.json({ error: "notes must be a string" }, { status: 400 });
  }
  if (body?.professional_id !== undefined && body.professional_id !== null && typeof body.professional_id !== "string") {
    return NextResponse.json({ error: "professional_id must be a string" }, { status: 400 });
  }

  const [{ data: service, error: serviceError }, { data: customer, error: customerError }, { data: company, error: companyError }] =
    await Promise.all([
      supabase
        .from("services")
        .select("id, name, duration_minutes, buffer_minutes, is_active")
        .eq("id", serviceId)
        .eq("company_id", companyId)
        .maybeSingle(),
      supabase.from("customers").select("id, name").eq("id", customerId).eq("company_id", companyId).maybeSingle(),
      supabase.from("companies").select("requires_appointment_approval, timezone").eq("id", companyId).single(),
    ]);

  if (serviceError || customerError || companyError) {
    return NextResponse.json(
      { error: (serviceError ?? customerError ?? companyError)!.message },
      { status: 500 },
    );
  }
  if (!service) {
    return NextResponse.json({ error: "service not found for this company" }, { status: 400 });
  }
  if (!service.is_active) {
    return NextResponse.json({ error: "service is not active" }, { status: 400 });
  }
  if (!customer) {
    return NextResponse.json({ error: "customer not found for this company" }, { status: 400 });
  }

  if (body?.conversation_id) {
    const { data: conversation, error: conversationError } = await supabase
      .from("conversations")
      .select("id")
      .eq("id", body.conversation_id)
      .eq("company_id", companyId)
      .maybeSingle();
    if (conversationError) {
      return NextResponse.json({ error: conversationError.message }, { status: 500 });
    }
    if (!conversation) {
      return NextResponse.json({ error: "conversation not found for this company" }, { status: 400 });
    }
  }

  if (body?.agent_id) {
    const { data: agent, error: agentError } = await supabase
      .from("agents")
      .select("id")
      .eq("id", body.agent_id)
      .maybeSingle();
    if (agentError) {
      return NextResponse.json({ error: agentError.message }, { status: 500 });
    }
    if (!agent) {
      return NextResponse.json({ error: "agent not found" }, { status: 400 });
    }
  }

  let professionalId = typeof body?.professional_id === "string" ? body.professional_id : "";
  if (!professionalId) {
    const active = await listProfessionals(supabase, companyId);
    if (active.length !== 1) {
      return NextResponse.json({ error: "professional_id is required" }, { status: 400 });
    }
    professionalId = active[0].id;
  }
  const resolved = await resolveProfessionalForService(supabase, companyId, professionalId, serviceId);
  if (!resolved.ok) {
    return NextResponse.json(
      {
        error:
          resolved.reason === "professional_not_found"
            ? "professional not found for this company"
            : "this professional doesn't perform this service",
      },
      { status: 400 },
    );
  }

  const timezone = company.timezone && isValidTimeZone(company.timezone) ? company.timezone : "UTC";

  // The professional's own hours (or the establishment's they inherit) and
  // any time off that applies to them. No configured hours at all means "not
  // set up yet," not "never open" -- a brand-new company (business_hours
  // starts empty, H2) can still take bookings. Time off always applies.
  const fits = await fitsProfessionalSchedule(supabase, companyId, resolved.professional, {
    timezone,
    startsAt: startsAt.toISOString(),
    durationMinutes: service.duration_minutes,
  });
  if (!fits) {
    return NextResponse.json({ error: "This time is outside business hours" }, { status: 400 });
  }

  const endsAt = new Date(startsAt.getTime() + (service.duration_minutes + service.buffer_minutes) * 60_000);
  const status = company.requires_appointment_approval ? "requested" : "confirmed";

  const { data, error } = await supabase
    .from("appointments")
    .insert({
      company_id: companyId,
      service_id: serviceId,
      professional_id: professionalId,
      customer_id: customerId,
      conversation_id: body?.conversation_id ?? null,
      agent_id: body?.agent_id ?? null,
      status,
      starts_at: startsAt.toISOString(),
      ends_at: endsAt.toISOString(),
      notes: body?.notes ?? null,
    })
    .select()
    .single();

  if (error) {
    // Postgres 23P01 = exclusion_violation — the EXCLUDE constraint caught
    // an overlap with a live appointment of the same professional. A
    // clean 409 beats surfacing the raw constraint-violation message.
    if (error.code === "23P01") {
      return NextResponse.json(
        { error: "This time overlaps with an existing appointment" },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Sync to Google Calendar only once the appointment is actually
  // confirmed — a `requested` one pending manual approval never touches
  // the merchant's calendar. Best-effort: a sync failure never fails the
  // booking itself, see appointment-sync.ts.
  if (status === "confirmed") {
    const googleEvent = await syncAppointmentConfirmed(professionalId, {
      serviceName: service.name,
      customerName: customer.name,
      startsAt: data.starts_at,
      visibleEndsAt: calendarVisibleEndsAt(data.starts_at, service.duration_minutes),
    });
    if (googleEvent) {
      const { data: synced } = await supabase
        .from("appointments")
        .update({ google_event_id: googleEvent.googleEventId, google_calendar_id: googleEvent.googleCalendarId })
        .eq("id", data.id)
        .select()
        .single();
      if (synced) return NextResponse.json({ appointment: synced }, { status: 201 });
    }
  }

  return NextResponse.json({ appointment: data }, { status: 201 });
}
