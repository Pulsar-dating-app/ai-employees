import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";
import { isValidTimeZone } from "@/lib/analytics/load";
import { loadAvailableSlots, ServiceNotFoundError } from "@/lib/availability/load";
import {
  isWithinBusinessHours,
  isDuringTimeOff,
  type BusinessHourWindow,
  type TimeOffBlock,
} from "@/lib/availability/engine";
import {
  syncAppointmentConfirmed,
  syncAppointmentCancelled,
  syncAppointmentRescheduled,
} from "@/lib/google-calendar/appointment-sync";

// Trello J3 -- the abstraction Ana's scheduling tools (list_services /
// find_available_slots / book_appointment / cancel_appointment) call
// in-process, exactly the way B5's ProductRepository backs Malu's
// search_products/get_product (see that file's header). Its real caller is
// an inbound WhatsApp message with no authenticated merchant session, so
// every query goes through the service-role client and filters company_id
// explicitly rather than relying on RLS. `supabaseClient` is an optional
// injectable override (the Agent Engine's tool wrappers pass ctx.supabase
// through so an integration test can point the whole pipeline at the local
// test stack); it defaults to createServiceClient() only when omitted.
//
// Load-bearing rule, same as every tool in src/lib/agent-engine/tools:
// companyId / customerId / conversationId / agentId are always supplied by
// the caller from the trusted ToolExecutionContext, never taken from a
// model-chosen argument. cancel() additionally scopes to customer_id so Ana
// can only ever cancel the appointment of the customer she is talking to.
//
// The booking path mirrors POST /api/companies/[companyId]/appointments
// (H3) field-for-field -- server-computed ends_at (duration + buffer),
// server-decided status from companies.requires_appointment_approval,
// business-hours enforcement, the 23P01 overlap-constraint catch, and the
// I3 "sync to Google only once confirmed" hook -- so the two write paths
// stay behaviourally identical. A failed booking is a returned result
// object, not a thrown error: a throw aborts the whole turn (see
// tool-loop.ts), where a result lets Ana honestly tell the customer the
// slot was taken and offer another, the same pattern as create_checkout_link.

const MAX_SLOTS_RETURNED = 20;

type IntakeField = { label: string; is_required: boolean };

// Trello K8/K9 -- the merchant's configured pre-booking questions, in
// display order. Shared by findAvailableSlots (surfaces them to the agent)
// and book (enforces the required ones).
async function loadIntakeFields(
  client: SupabaseClient,
  companyId: string,
): Promise<IntakeField[]> {
  const { data, error } = await client
    .from("appointment_intake_fields")
    .select("label, is_required")
    .eq("company_id", companyId)
    .order("position", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((row) => ({
    label: row.label as string,
    is_required: row.is_required as boolean,
  }));
}

// The model keys `intakeAnswers` by the question label; match tolerantly
// (case- and whitespace-insensitive) so "cpf" answers a "CPF" field.
function normalizeAnswerKeys(
  answers: Record<string, unknown> | null | undefined,
): Map<string, string> {
  const out = new Map<string, string>();
  for (const [key, value] of Object.entries(answers ?? {})) {
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (trimmed === "") continue;
    out.set(key.trim().toLowerCase(), trimmed);
  }
  return out;
}

export type BookableService = {
  id: string;
  name: string;
  description: string | null;
  durationMinutes: number;
  // Postgres numeric -> string from PostgREST, same as ProductRepository.
  price: string | null;
  currency: string | null;
  category: string | null;
};

export type FindAvailableSlotsResult =
  | { available: false; reason: "service_not_found" }
  | {
      available: true;
      timezone: string;
      // False whenever the connected Google Calendar wasn't actually
      // consulted (not connected, refresh failed, or the freeBusy call
      // itself failed) -- slots still come from business_hours + our own
      // appointments alone. See availability/load.ts.
      googleCalendarChecked: boolean;
      slots: { start: string; end: string }[];
      // The real result had more than MAX_SLOTS_RETURNED; the customer
      // should narrow the date range or state a preference.
      truncated: boolean;
      // Merchant time off overlapping the requested window (inclusive local
      // dates + the merchant's own `reason`, which may be null). When
      // `slots` is empty and this isn't, that's why -- the agent can tell
      // the customer the business is away then instead of just "nothing's
      // free".
      timeOff: { start: string; end: string; reason: string | null }[];
      // Trello K8/K9 -- the customer details this business wants collected
      // before a booking (appointment_intake_fields). `label` is the raw
      // data point ("Full name", "CPF", "Idade"); the agent phrases the
      // actual question. `required` ones must be answered before
      // book_appointment will go through; optional ones are asked once and
      // skipped if the customer doesn't answer. Empty when nothing is
      // configured.
      intakeQuestions: { label: string; required: boolean }[];
    };

export type BookResult =
  | {
      booked: false;
      reason:
        | "invalid_time"
        | "service_not_found"
        | "customer_not_found"
        | "outside_business_hours"
        | "slot_unavailable"
        // Trello J7 -- the start is sooner than companies.min_lead_time_minutes allows.
        | "too_soon";
    }
  | { booked: false; reason: "missing_intake_answers"; missingRequired: string[] }
  | {
      booked: true;
      status: "requested" | "confirmed";
      appointmentId: string;
      serviceName: string;
      startsAt: string;
      endsAt: string;
      timezone: string;
    };

export type CancelResult =
  // Trello J7 -- "cutoff_passed": within companies.cancellation_cutoff_hours
  // of the start, so the customer can't self-cancel; Ana points them at the team.
  | { cancelled: false; reason: "not_found" | "cutoff_passed" }
  | { cancelled: true; appointmentId: string; alreadyCancelled: boolean };

// Trello J5 -- one of the customer's own appointments, as list_my_appointments
// returns it. `id` is what reschedule_appointment / cancel_appointment take.
export type MyAppointment = {
  id: string;
  serviceName: string;
  startsAt: string;
  endsAt: string;
  status: string;
  timezone: string;
};

// Trello J6 -- the dedicated reschedule path (replaces "cancel then rebook").
export type RescheduleResult =
  | {
      rescheduled: false;
      reason:
        | "not_found"
        | "invalid_time"
        | "too_soon"
        | "outside_business_hours"
        | "slot_unavailable"
        | "not_reschedulable";
    }
  | {
      rescheduled: true;
      appointmentId: string;
      serviceName: string;
      startsAt: string;
      endsAt: string;
      timezone: string;
    };

async function listServices(
  companyId: string,
  supabaseClient?: SupabaseClient,
): Promise<BookableService[]> {
  const client = supabaseClient ?? createServiceClient();
  const { data, error } = await client
    .from("services")
    .select("id, name, description, duration_minutes, price, currency, category")
    .eq("company_id", companyId)
    .eq("is_active", true)
    .order("name", { ascending: true });

  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id as string,
    name: row.name as string,
    description: (row.description as string | null) ?? null,
    durationMinutes: row.duration_minutes as number,
    price: (row.price as string | null) ?? null,
    currency: (row.currency as string | null) ?? null,
    category: (row.category as string | null) ?? null,
  }));
}

async function findAvailableSlots(
  {
    companyId,
    serviceId,
    from,
    to,
  }: { companyId: string; serviceId: string; from: string; to: string },
  supabaseClient?: SupabaseClient,
): Promise<FindAvailableSlotsResult> {
  const client = supabaseClient ?? createServiceClient();

  try {
    const { slots, googleCalendarChecked, timeOff } = await loadAvailableSlots({
      supabase: client,
      companyId,
      serviceId,
      from,
      to,
    });

    const [{ data: company }, intakeFields] = await Promise.all([
      client.from("companies").select("timezone").eq("id", companyId).maybeSingle(),
      loadIntakeFields(client, companyId),
    ]);
    const timezone =
      company?.timezone && isValidTimeZone(company.timezone) ? company.timezone : "UTC";

    return {
      available: true,
      timezone,
      googleCalendarChecked,
      slots: slots.slice(0, MAX_SLOTS_RETURNED),
      truncated: slots.length > MAX_SLOTS_RETURNED,
      timeOff,
      intakeQuestions: intakeFields.map((f) => ({ label: f.label, required: f.is_required })),
    };
  } catch (err) {
    // A missing/inactive service, or one belonging to another company, is
    // a model-recoverable answer ("that isn't something we offer"), not a
    // turn-aborting error.
    if (err instanceof ServiceNotFoundError) {
      return { available: false, reason: "service_not_found" };
    }
    throw err;
  }
}

async function book(
  {
    companyId,
    serviceId,
    customerId,
    conversationId,
    agentId,
    startsAt,
    notes,
    intakeAnswers,
  }: {
    companyId: string;
    serviceId: string;
    customerId: string;
    conversationId: string | null;
    agentId: string | null;
    startsAt: string;
    notes: string | null;
    // Trello K9 -- answers the agent collected for the merchant's intake
    // questions, keyed by question label. Null/omitted when the business has
    // none configured.
    intakeAnswers: Record<string, unknown> | null;
  },
  supabaseClient?: SupabaseClient,
): Promise<BookResult> {
  const client = supabaseClient ?? createServiceClient();

  const startDate = new Date(startsAt);
  if (Number.isNaN(startDate.getTime())) return { booked: false, reason: "invalid_time" };

  const [
    { data: service, error: serviceError },
    { data: customer, error: customerError },
    { data: company, error: companyError },
    intakeFields,
  ] = await Promise.all([
    client
      .from("services")
      .select("id, name, duration_minutes, buffer_minutes, is_active")
      .eq("id", serviceId)
      .eq("company_id", companyId)
      .maybeSingle(),
    client
      .from("customers")
      .select("id, name")
      .eq("id", customerId)
      .eq("company_id", companyId)
      .maybeSingle(),
    client
      .from("companies")
      .select("timezone, requires_appointment_approval, min_lead_time_minutes")
      .eq("id", companyId)
      .maybeSingle(),
    loadIntakeFields(client, companyId),
  ]);

  if (serviceError) throw serviceError;
  if (customerError) throw customerError;
  if (companyError) throw companyError;
  if (!service || !service.is_active) return { booked: false, reason: "service_not_found" };
  if (!customer) return { booked: false, reason: "customer_not_found" };

  const timezone =
    company?.timezone && isValidTimeZone(company.timezone) ? company.timezone : "UTC";

  // Trello J7 -- minimum booking lead time. find_available_slots already
  // stops offering these, but a hand-picked or stale time still has to be
  // rejected here. Checked right after the time is known to be valid, before
  // the heavier business-hours / intake checks.
  const minLeadMinutes = Number(company?.min_lead_time_minutes) || 0;
  if (minLeadMinutes > 0 && startDate.getTime() <= Date.now() + minLeadMinutes * 60_000) {
    return { booked: false, reason: "too_soon" };
  }

  const { data: businessHours, error: businessHoursError } = await client
    .from("business_hours")
    .select("day_of_week, start_time, end_time")
    .eq("company_id", companyId)
    .eq("is_active", true);
  if (businessHoursError) throw businessHoursError;

  // No configured hours means "not set up yet," not "never open" -- same
  // permissive default as the H3 write route (see its own comment and the
  // 2026-08-29 decisions.md entry).
  if (businessHours && businessHours.length > 0) {
    const withinHours = isWithinBusinessHours({
      timezone,
      businessHours: businessHours as BusinessHourWindow[],
      startsAt: startDate.toISOString(),
      durationMinutes: service.duration_minutes,
    });
    if (!withinHours) return { booked: false, reason: "outside_business_hours" };
  }

  // Merchant-registered time off (K3). find_available_slots already excludes
  // these dates; this catches a stale slot or a hand-picked time. Reuses the
  // outside_business_hours reason -- "the business isn't available then"
  // covers both, and it keeps the tool contract unchanged.
  const { data: timeOff, error: timeOffError } = await client
    .from("company_time_off")
    .select("start_date, end_date")
    .eq("company_id", companyId);
  if (timeOffError) throw timeOffError;
  if (isDuringTimeOff((timeOff ?? []) as TimeOffBlock[], timezone, startDate.toISOString())) {
    return { booked: false, reason: "outside_business_hours" };
  }

  // Trello K9 -- the merchant's pre-booking questions. Every required one
  // must have a non-empty answer before the row is written; the model gets
  // the labels back so it can ask and retry. Optional questions never block:
  // an answer is stored if given, ignored if not. Checked after the slot
  // validations so a bad time surfaces first (more actionable), and so a
  // retry after collecting the info runs against a known-good slot.
  const providedAnswers = normalizeAnswerKeys(intakeAnswers);
  const missingRequired = intakeFields
    .filter((f) => f.is_required && !providedAnswers.has(f.label.trim().toLowerCase()))
    .map((f) => f.label);
  if (missingRequired.length > 0) {
    return { booked: false, reason: "missing_intake_answers", missingRequired };
  }
  const storedIntakeAnswers: Record<string, string> = {};
  for (const field of intakeFields) {
    const answer = providedAnswers.get(field.label.trim().toLowerCase());
    if (answer) storedIntakeAnswers[field.label] = answer;
  }

  const endsAt = new Date(
    startDate.getTime() + (service.duration_minutes + service.buffer_minutes) * 60_000,
  );
  const status: "requested" | "confirmed" = company?.requires_appointment_approval
    ? "requested"
    : "confirmed";

  const { data: appointment, error } = await client
    .from("appointments")
    .insert({
      company_id: companyId,
      service_id: serviceId,
      customer_id: customerId,
      conversation_id: conversationId,
      agent_id: agentId,
      status,
      starts_at: startDate.toISOString(),
      ends_at: endsAt.toISOString(),
      notes: notes ?? null,
      intake_answers: storedIntakeAnswers,
    })
    .select()
    .single();

  if (error) {
    // 23P01 = exclusion_violation: the H3 EXCLUDE constraint caught an
    // overlap with an existing live appointment. Robust against the race an
    // app-layer check-then-insert can't be.
    if (error.code === "23P01") return { booked: false, reason: "slot_unavailable" };
    throw error;
  }

  // Sync to Google Calendar only once the appointment is actually confirmed
  // -- a `requested` one pending manual approval never touches the merchant's
  // calendar (I3). Best-effort: syncAppointmentConfirmed never throws, and a
  // null return just leaves google_event_id null.
  if (status === "confirmed") {
    const googleEventId = await syncAppointmentConfirmed(companyId, {
      serviceName: service.name,
      customerName: customer.name,
      startsAt: appointment.starts_at,
      endsAt: appointment.ends_at,
    });
    if (googleEventId) {
      await client
        .from("appointments")
        .update({ google_event_id: googleEventId })
        .eq("id", appointment.id);
    }
  }

  return {
    booked: true,
    status,
    appointmentId: appointment.id as string,
    serviceName: service.name as string,
    startsAt: appointment.starts_at as string,
    endsAt: appointment.ends_at as string,
    timezone,
  };
}

async function cancel(
  {
    companyId,
    appointmentId,
    customerId,
    reason,
  }: { companyId: string; appointmentId: string; customerId: string; reason: string | null },
  supabaseClient?: SupabaseClient,
): Promise<CancelResult> {
  const client = supabaseClient ?? createServiceClient();

  // Scoped to customer_id as well as company_id: Ana must never be able to
  // cancel a booking that isn't this customer's, even with a valid id.
  const [{ data: appointment, error }, { data: company, error: companyError }] = await Promise.all([
    client
      .from("appointments")
      .select("id, status, starts_at, google_event_id")
      .eq("id", appointmentId)
      .eq("company_id", companyId)
      .eq("customer_id", customerId)
      .maybeSingle(),
    client
      .from("companies")
      .select("cancellation_cutoff_hours")
      .eq("id", companyId)
      .maybeSingle(),
  ]);
  if (error) throw error;
  if (companyError) throw companyError;
  if (!appointment) return { cancelled: false, reason: "not_found" };

  if (appointment.status === "cancelled") {
    return { cancelled: true, appointmentId, alreadyCancelled: true };
  }

  // Trello J7 -- inside the merchant's cancellation cutoff, the customer
  // can't self-cancel; Ana tells them to contact the team. Never blocks a
  // cancel of an already-past appointment oddity: if starts_at is already
  // behind us the cutoff has trivially passed, which is the intended answer.
  const cutoffHours = Number(company?.cancellation_cutoff_hours) || 0;
  if (
    cutoffHours > 0 &&
    Date.now() > new Date(appointment.starts_at).getTime() - cutoffHours * 3_600_000
  ) {
    return { cancelled: false, reason: "cutoff_passed" };
  }

  const { error: updateError } = await client
    .from("appointments")
    .update({
      status: "cancelled",
      cancellation_reason: reason ?? null,
      // Cleared here so a later externally-triggered sync can't act on a
      // stale id; matches the H3 DELETE/PATCH cancel branch.
      google_event_id: null,
    })
    .eq("id", appointmentId);
  if (updateError) throw updateError;

  if (appointment.google_event_id) {
    await syncAppointmentCancelled(companyId, appointment.google_event_id as string);
  }

  return { cancelled: true, appointmentId, alreadyCancelled: false };
}

// Trello J5 -- the customer's own upcoming appointments. Resolved by the
// trusted ctx.customerId (covers Instagram, and web chat on the same
// browser), and additionally by an `email` the customer states out loud --
// the cross-device / new-session path, since a web-chat customer is
// otherwise only known by a per-browser session id.
//
// Read-only by design: an email here is unverified (anyone in the chat can
// type any address), so it can widen what Ana can *show* but never what she
// can *change* -- cancel()/reschedule() stay strictly scoped to
// ctx.customerId. See decisions.md 2026-09-02.
async function listMyAppointments(
  {
    companyId,
    customerId,
    email,
  }: { companyId: string; customerId: string; email?: string | null },
  supabaseClient?: SupabaseClient,
): Promise<MyAppointment[]> {
  const client = supabaseClient ?? createServiceClient();

  const customerIds = new Set<string>([customerId]);
  const trimmedEmail = typeof email === "string" ? email.trim() : "";
  if (trimmedEmail) {
    const { data: matches, error: matchError } = await client
      .from("customers")
      .select("id")
      .eq("company_id", companyId)
      .ilike("email", trimmedEmail);
    if (matchError) throw matchError;
    for (const row of matches ?? []) customerIds.add(row.id as string);
  }

  const [{ data: company }, { data: rows, error }] = await Promise.all([
    client.from("companies").select("timezone").eq("id", companyId).maybeSingle(),
    client
      .from("appointments")
      .select("id, starts_at, ends_at, status, services(name)")
      .eq("company_id", companyId)
      .in("customer_id", [...customerIds])
      .not("status", "in", "(cancelled,no_show)")
      .gte("ends_at", new Date().toISOString())
      .order("starts_at", { ascending: true })
      .limit(10),
  ]);
  if (error) throw error;

  const timezone =
    company?.timezone && isValidTimeZone(company.timezone) ? company.timezone : "UTC";

  return (rows ?? []).map((row) => {
    const service = row.services as { name: string } | { name: string }[] | null;
    const serviceName = Array.isArray(service) ? (service[0]?.name ?? "") : (service?.name ?? "");
    return {
      id: row.id as string,
      serviceName,
      startsAt: row.starts_at as string,
      endsAt: row.ends_at as string,
      status: row.status as string,
      timezone,
    };
  });
}

// Trello J6 -- move an existing appointment to a new time in one write,
// replacing the old "cancel then rebook" two-step (which left the freed
// slot exposed and could strand the customer if the rebook failed).
// Mirrors the H3 PATCH-reschedule path field-for-field: server-computed
// ends_at, business-hours + time-off + lead-time checks, the 23P01 overlap
// catch, and syncAppointmentRescheduled for a calendar-synced row. Scoped
// to ctx.customerId like cancel().
async function reschedule(
  {
    companyId,
    appointmentId,
    customerId,
    newStartsAt,
  }: { companyId: string; appointmentId: string; customerId: string; newStartsAt: string },
  supabaseClient?: SupabaseClient,
): Promise<RescheduleResult> {
  const client = supabaseClient ?? createServiceClient();

  const { data: appointment, error } = await client
    .from("appointments")
    .select("id, status, service_id, google_event_id")
    .eq("id", appointmentId)
    .eq("company_id", companyId)
    .eq("customer_id", customerId)
    .maybeSingle();
  if (error) throw error;
  if (!appointment) return { rescheduled: false, reason: "not_found" };
  if (!["requested", "confirmed"].includes(appointment.status as string)) {
    return { rescheduled: false, reason: "not_reschedulable" };
  }

  const startDate = new Date(newStartsAt);
  if (Number.isNaN(startDate.getTime())) return { rescheduled: false, reason: "invalid_time" };

  const [
    { data: service, error: serviceError },
    { data: company, error: companyError },
    { data: businessHours, error: businessHoursError },
    { data: timeOff, error: timeOffError },
  ] = await Promise.all([
    client
      .from("services")
      .select("name, duration_minutes, buffer_minutes")
      .eq("id", appointment.service_id)
      .eq("company_id", companyId)
      .maybeSingle(),
    client
      .from("companies")
      .select("timezone, min_lead_time_minutes")
      .eq("id", companyId)
      .maybeSingle(),
    client
      .from("business_hours")
      .select("day_of_week, start_time, end_time")
      .eq("company_id", companyId)
      .eq("is_active", true),
    client.from("company_time_off").select("start_date, end_date").eq("company_id", companyId),
  ]);
  if (serviceError) throw serviceError;
  if (companyError) throw companyError;
  if (businessHoursError) throw businessHoursError;
  if (timeOffError) throw timeOffError;
  if (!service) return { rescheduled: false, reason: "not_reschedulable" };

  const timezone =
    company?.timezone && isValidTimeZone(company.timezone) ? company.timezone : "UTC";

  const minLeadMinutes = Number(company?.min_lead_time_minutes) || 0;
  if (minLeadMinutes > 0 && startDate.getTime() <= Date.now() + minLeadMinutes * 60_000) {
    return { rescheduled: false, reason: "too_soon" };
  }

  if (businessHours && businessHours.length > 0) {
    const withinHours = isWithinBusinessHours({
      timezone,
      businessHours: businessHours as BusinessHourWindow[],
      startsAt: startDate.toISOString(),
      durationMinutes: service.duration_minutes,
    });
    if (!withinHours) return { rescheduled: false, reason: "outside_business_hours" };
  }
  if (isDuringTimeOff((timeOff ?? []) as TimeOffBlock[], timezone, startDate.toISOString())) {
    return { rescheduled: false, reason: "outside_business_hours" };
  }

  const endsAt = new Date(
    startDate.getTime() + (service.duration_minutes + service.buffer_minutes) * 60_000,
  );

  const { error: updateError } = await client
    .from("appointments")
    .update({ starts_at: startDate.toISOString(), ends_at: endsAt.toISOString() })
    .eq("id", appointmentId);
  if (updateError) {
    if (updateError.code === "23P01") return { rescheduled: false, reason: "slot_unavailable" };
    throw updateError;
  }

  if (appointment.google_event_id) {
    await syncAppointmentRescheduled(companyId, appointment.google_event_id as string, {
      startsAt: startDate.toISOString(),
      endsAt: endsAt.toISOString(),
    });
  }

  return {
    rescheduled: true,
    appointmentId,
    serviceName: service.name as string,
    startsAt: startDate.toISOString(),
    endsAt: endsAt.toISOString(),
    timezone,
  };
}

export const AppointmentRepository = {
  listServices,
  findAvailableSlots,
  book,
  cancel,
  listMyAppointments,
  reschedule,
};
