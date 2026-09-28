import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";
import { isValidTimeZone, localDate } from "@/lib/analytics/load";
import { validateIntakeAnswer } from "@/lib/appointments/intake-fields";
import { sendEmail } from "@/lib/email/client";
import { formatWhen } from "@/lib/email/appointments";
import { renderWaitlistOpeningEmail } from "@/lib/email/templates";
import { resolveProfessionalForService } from "@/lib/professionals/repository";
import { loadAvailableSlots } from "@/lib/availability/load";

// Trello R5 -- the waitlist ("let me know if something opens up on Friday").
// Two halves, mirroring how R3/R4 split write-time hooks from the send:
//   * addToWaitlist -- Ana's add_to_waitlist tool calls this in-process when
//     find_available_slots came back empty for the customer's window and they
//     want to be told if a slot frees up. Service-role client by default,
//     companyId/customerId/etc. always from the trusted ToolExecutionContext.
//   * notifyWaitlistForFreedSlot -- every appointment-cancel path calls this
//     best-effort after the DB write, to email the oldest still-waiting
//     customer whose window covers the freed slot. MVP: notify only, the
//     slot is never held.
//
// 2026-09-24 -- an entry can wait for one professional (professional_id) or
// for anyone (NULL). A slot freed on professional A notifies the oldest entry
// waiting for A or for anyone -- never someone waiting for B.

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const TIME_HH_MM = /^([01]\d|2[0-3]):[0-5]\d$/;

// A UTC instant as HH:MM on the business's wall clock.
function localTime(timezone: string, instant: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(instant));
}

function one<T>(v: T | T[] | null): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

export type AddToWaitlistResult =
  | {
      added: false;
      reason:
        | "invalid_range"
        | "invalid_time"
        | "service_not_found"
        | "invalid_email"
        | "email_required"
        | "professional_not_found"
        | "professional_not_for_service";
    }
  | { added: true; alreadyWaiting: boolean; waitlistId: string };

async function addToWaitlist(
  {
    companyId,
    customerId,
    serviceId,
    conversationId,
    agentId,
    from,
    to,
    email,
    professionalId,
    time,
  }: {
    companyId: string;
    customerId: string;
    serviceId: string;
    conversationId: string | null;
    agentId: string | null;
    from: string;
    to: string;
    // An address the agent just collected. Optional -- falls back to the
    // customer row's existing email.
    email: string | null;
    // The professional the customer wants to wait for; omitted/null = anyone.
    professionalId?: string | null;
    // 2026-09-28 -- the exact local start time they need ("HH:MM"), or
    // omitted/null for any time in the window.
    time?: string | null;
  },
  supabaseClient?: SupabaseClient,
): Promise<AddToWaitlistResult> {
  const client = supabaseClient ?? createServiceClient();

  if (!DATE_ONLY.test(from) || !DATE_ONLY.test(to) || to < from) {
    return { added: false, reason: "invalid_range" };
  }
  const desiredTime = typeof time === "string" && time.trim() ? time.trim() : null;
  if (desiredTime && !TIME_HH_MM.test(desiredTime)) return { added: false, reason: "invalid_time" };

  const [{ data: service, error: serviceError }, { data: customer, error: customerError }] =
    await Promise.all([
      client
        .from("services")
        .select("id, is_active")
        .eq("id", serviceId)
        .eq("company_id", companyId)
        .maybeSingle(),
      client
        .from("customers")
        .select("email")
        .eq("id", customerId)
        .eq("company_id", companyId)
        .maybeSingle(),
    ]);
  if (serviceError) throw serviceError;
  if (customerError) throw customerError;
  if (!service || !service.is_active) return { added: false, reason: "service_not_found" };

  if (professionalId) {
    const resolved = await resolveProfessionalForService(client, companyId, professionalId, serviceId);
    if (!resolved.ok) return { added: false, reason: resolved.reason };
  }

  // The whole feature is a future email, so an entry we can't reach is
  // pointless -- resolve an address now (explicit one wins, else the
  // customer row's) and refuse without one so Ana asks.
  const provided = typeof email === "string" ? email.trim() : "";
  if (provided && validateIntakeAnswer("email", provided)) {
    return { added: false, reason: "invalid_email" };
  }
  const existing = (customer?.email ?? "").trim();
  const notifyEmail = provided || existing;
  if (!notifyEmail) return { added: false, reason: "email_required" };

  // Fill a blank customer email so R3/R4 and the freed-slot notice can reach
  // them; never overwrite one they already have (same rule as book()).
  if (provided && !existing) {
    try {
      await client.from("customers").update({ email: provided }).eq("id", customerId);
    } catch {
      // Non-fatal -- the waitlist row is the point.
    }
  }

  const { data: inserted, error } = await client
    .from("appointment_waitlist")
    .insert({
      company_id: companyId,
      customer_id: customerId,
      service_id: serviceId,
      professional_id: professionalId ?? null,
      conversation_id: conversationId,
      agent_id: agentId,
      desired_from: from,
      desired_to: to,
      desired_time: desiredTime,
    })
    .select("id")
    .single();

  if (error) {
    // 23505 on the open-dedupe index: already on this list for this exact
    // window. Re-asking just keeps the original place in line.
    if (error.code === "23505") {
      let dupeQuery = client
        .from("appointment_waitlist")
        .select("id")
        .eq("company_id", companyId)
        .eq("customer_id", customerId)
        .eq("service_id", serviceId)
        .eq("desired_from", from)
        .eq("desired_to", to)
        .is("notified_at", null);
      dupeQuery = professionalId
        ? dupeQuery.eq("professional_id", professionalId)
        : dupeQuery.is("professional_id", null);
      dupeQuery = desiredTime ? dupeQuery.eq("desired_time", desiredTime) : dupeQuery.is("desired_time", null);
      const { data: dupe } = await dupeQuery.maybeSingle();
      return { added: true, alreadyWaiting: true, waitlistId: (dupe?.id as string) ?? "" };
    }
    throw error;
  }

  return { added: true, alreadyWaiting: false, waitlistId: inserted.id as string };
}

// How many waiting entries one cancel looks at before giving up. Each one
// costs an availability computation, so this stays small.
const MAX_WAITLIST_CANDIDATES = 5;

// The earliest bookable start for `serviceId` with `professionalId` inside
// the freed interval [freedStart, freedEnd) -- at exactly `desiredTime`
// (local HH:MM) when the entry asked for one -- or null. Uses the real
// availability engine, so a shorter service fits a longer freed slot (a
// 15-min "pezinho" in a cancelled 30-min "barba"), and one that no longer fits
// -- too long, not performed by that professional, service turned off -- is
// skipped rather than emailed about.
async function freedStartFor(
  supabase: SupabaseClient,
  companyId: string,
  serviceId: string,
  professionalId: string,
  slotDate: string,
  freedStart: number,
  freedEnd: number,
  timezone: string,
  desiredTime: string | null,
): Promise<string | null> {
  try {
    const { slots } = await loadAvailableSlots({
      supabase,
      companyId,
      serviceId,
      professionalId,
      from: slotDate,
      to: slotDate,
    });
    const hit = slots.find((slot) => {
      const at = new Date(slot.start).getTime();
      if (at < freedStart || at >= freedEnd) return false;
      return !desiredTime || localTime(timezone, slot.start) === desiredTime;
    });
    return hit?.start ?? null;
  } catch {
    // ServiceNotFoundError / ProfessionalNotAvailableError: this entry can't
    // use the opening.
    return null;
  }
}

// Best-effort, void, never throws -- called from every cancel path
// (AppointmentRepository.cancel, the H3 PATCH/DELETE routes) right after the
// status write lands. Emails the oldest still-waiting customer whose window
// covers the freed slot's local date AND whose service can actually be
// booked in the freed time, then stamps notified_at on a successful send
// (guarded on notified_at IS NULL so two near-simultaneous cancels can't both
// claim it). A send failure leaves the entry waiting for the next opening.
//
// 2026-09-28 -- no longer requires the SAME service as the cancelled
// appointment. Found in testing: a customer waiting for a "pezinho" with
// Bruno at 10h was never told when Bruno's 10h "barba" was cancelled, because
// the match was `service_id = cancelled service`. What frees up is the
// professional's time, so every waiting service is checked against it.
export async function notifyWaitlistForFreedSlot({
  supabase,
  companyId,
  professionalId,
  startsAt,
  endsAt,
}: {
  supabase: SupabaseClient;
  companyId: string;
  // The professional whose slot was freed.
  professionalId: string;
  // The cancelled appointment's interval (ends_at includes its buffer).
  startsAt: string;
  endsAt: string;
}): Promise<void> {
  try {
    const { data: company } = await supabase
      .from("companies")
      .select("name, email, phone, timezone")
      .eq("id", companyId)
      .maybeSingle();
    if (!company) return;

    const tz = company.timezone && isValidTimeZone(company.timezone) ? company.timezone : "UTC";
    const slotDate = localDate(tz, new Date(startsAt));
    const freedStart = new Date(startsAt).getTime();
    const freedEnd = new Date(endsAt).getTime();

    const { data: candidates } = await supabase
      .from("appointment_waitlist")
      .select("id, service_id, desired_time, customers(email), services(name)")
      .eq("company_id", companyId)
      .or(`professional_id.is.null,professional_id.eq.${professionalId}`)
      .is("notified_at", null)
      .lte("desired_from", slotDate)
      .gte("desired_to", slotDate)
      .order("created_at", { ascending: true })
      .limit(MAX_WAITLIST_CANDIDATES);

    for (const match of candidates ?? []) {
      const to = one(match.customers as { email: string | null } | { email: string | null }[] | null)
        ?.email?.trim();
      if (!to || !match.service_id) continue;

      const openingStart = await freedStartFor(
        supabase,
        companyId,
        match.service_id as string,
        professionalId,
        slotDate,
        freedStart,
        freedEnd,
        tz,
        // Postgres `time` comes back as HH:MM:SS.
        typeof match.desired_time === "string" ? match.desired_time.slice(0, 5) : null,
      );
      if (!openingStart) continue;

      const serviceName =
        one(match.services as { name: string } | { name: string }[] | null)?.name ?? "agendamento";
      const contactBits = [company.email, company.phone].filter(Boolean) as string[];

      const rendered = renderWaitlistOpeningEmail({
        businessName: company.name,
        serviceName,
        whenText: formatWhen(openingStart, tz),
        contact: contactBits.length > 0 ? `${company.name} (${contactBits.join(" / ")})` : null,
      });

      const result = await sendEmail({ to, ...rendered });
      if (!result.ok) return;

      await supabase
        .from("appointment_waitlist")
        .update({ notified_at: new Date().toISOString() })
        .eq("id", match.id)
        .is("notified_at", null);
      // One opening, one notice: the oldest waiter who can use it.
      return;
    }
  } catch (err) {
    console.error("notifyWaitlistForFreedSlot failed", err);
  }
}

export const WaitlistRepository = {
  addToWaitlist,
};
