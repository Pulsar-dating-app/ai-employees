import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";
import { isValidTimeZone, localDate } from "@/lib/analytics/load";
import { validateIntakeAnswer } from "@/lib/appointments/intake-fields";
import { sendEmail } from "@/lib/email/client";
import { formatWhen } from "@/lib/email/appointments";
import { renderWaitlistOpeningEmail } from "@/lib/email/templates";

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

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

function one<T>(v: T | T[] | null): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

export type AddToWaitlistResult =
  | { added: false; reason: "invalid_range" | "service_not_found" | "invalid_email" | "email_required" }
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
  },
  supabaseClient?: SupabaseClient,
): Promise<AddToWaitlistResult> {
  const client = supabaseClient ?? createServiceClient();

  if (!DATE_ONLY.test(from) || !DATE_ONLY.test(to) || to < from) {
    return { added: false, reason: "invalid_range" };
  }

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
      conversation_id: conversationId,
      agent_id: agentId,
      desired_from: from,
      desired_to: to,
    })
    .select("id")
    .single();

  if (error) {
    // 23505 on the open-dedupe index: already on this list for this exact
    // window. Re-asking just keeps the original place in line.
    if (error.code === "23505") {
      const { data: dupe } = await client
        .from("appointment_waitlist")
        .select("id")
        .eq("company_id", companyId)
        .eq("customer_id", customerId)
        .eq("service_id", serviceId)
        .eq("desired_from", from)
        .eq("desired_to", to)
        .is("notified_at", null)
        .maybeSingle();
      return { added: true, alreadyWaiting: true, waitlistId: (dupe?.id as string) ?? "" };
    }
    throw error;
  }

  return { added: true, alreadyWaiting: false, waitlistId: inserted.id as string };
}

// Best-effort, void, never throws -- called from every cancel path
// (AppointmentRepository.cancel, the H3 PATCH/DELETE routes) right after the
// status write lands. Finds the single oldest still-waiting entry whose
// window covers the freed slot's local date, emails that customer, and
// stamps notified_at on a successful send (guarded on notified_at IS NULL so
// two near-simultaneous cancels can't both claim it). A send failure leaves
// the entry waiting for the next opening.
export async function notifyWaitlistForFreedSlot({
  supabase,
  companyId,
  serviceId,
  startsAt,
}: {
  supabase: SupabaseClient;
  companyId: string;
  // Null when the cancelled row had lost its service (on delete set null) --
  // nothing service-scoped can match it.
  serviceId: string | null;
  startsAt: string;
}): Promise<void> {
  try {
    if (!serviceId) return;

    const { data: company } = await supabase
      .from("companies")
      .select("name, email, phone, timezone")
      .eq("id", companyId)
      .maybeSingle();
    if (!company) return;

    const tz = company.timezone && isValidTimeZone(company.timezone) ? company.timezone : "UTC";
    const slotDate = localDate(tz, new Date(startsAt));

    const { data: match } = await supabase
      .from("appointment_waitlist")
      .select("id, customers(email), services(name)")
      .eq("company_id", companyId)
      .eq("service_id", serviceId)
      .is("notified_at", null)
      .lte("desired_from", slotDate)
      .gte("desired_to", slotDate)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (!match) return;

    const to = one(match.customers as { email: string | null } | { email: string | null }[] | null)
      ?.email?.trim();
    if (!to) return;

    const serviceName =
      one(match.services as { name: string } | { name: string }[] | null)?.name ?? "appointment";
    const contactBits = [company.email, company.phone].filter(Boolean) as string[];

    const rendered = renderWaitlistOpeningEmail({
      businessName: company.name,
      serviceName,
      whenText: formatWhen(startsAt, tz),
      contact: contactBits.length > 0 ? `${company.name} at ${contactBits.join(" / ")}` : null,
    });

    const result = await sendEmail({ to, ...rendered });
    if (!result.ok) return;

    await supabase
      .from("appointment_waitlist")
      .update({ notified_at: new Date().toISOString() })
      .eq("id", match.id)
      .is("notified_at", null);
  } catch (err) {
    console.error("notifyWaitlistForFreedSlot failed", err);
  }
}

export const WaitlistRepository = {
  addToWaitlist,
};
