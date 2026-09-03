import type { SupabaseClient } from "@supabase/supabase-js";
import { isValidTimeZone } from "@/lib/analytics/load";
import { sendEmail } from "./client";
import {
  renderConfirmationEmail,
  renderReminderEmail,
  renderDeclinedEmail,
  type AppointmentEmailData,
} from "./templates";

// Trello R3/R4 -- turns an appointment row into an email and sends it.
// Every function here is best-effort: it loads what it needs, sends, and
// returns void; a missing customer email or a provider failure is a
// no-op, never a thrown error. The booking / approval / cron that calls it
// is never blocked by mail.

type EmailContext = { to: string; data: AppointmentEmailData };

// Shared row shape from the joined select below.
type Row = {
  starts_at: string;
  services: { name: string } | { name: string }[] | null;
  customers: { email: string | null } | { email: string | null }[] | null;
  companies:
    | { name: string; email: string | null; phone: string | null; timezone: string | null }
    | { name: string; email: string | null; phone: string | null; timezone: string | null }[]
    | null;
};

function one<T>(v: T | T[] | null): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

export function formatWhen(startsAt: string, timezone: string | null): string {
  const tz = timezone && isValidTimeZone(timezone) ? timezone : "UTC";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(startsAt));
}

function contextFromRow(row: Row): EmailContext | null {
  const service = one(row.services);
  const customer = one(row.customers);
  const company = one(row.companies);
  const to = customer?.email?.trim();
  if (!to || !company) return null;

  const contactBits = [company.email, company.phone].filter(Boolean) as string[];
  return {
    to,
    data: {
      businessName: company.name,
      serviceName: service?.name ?? "your appointment",
      whenText: formatWhen(row.starts_at, company.timezone),
      businessNote: null,
      contact: contactBits.length > 0 ? `contact ${company.name} at ${contactBits.join(" / ")}` : null,
    },
  };
}

const APPOINTMENT_EMAIL_SELECT =
  "starts_at, services(name), customers(email), companies(name, email, phone, timezone)";

async function loadContext(
  supabase: SupabaseClient,
  appointmentId: string,
): Promise<EmailContext | null> {
  const { data, error } = await supabase
    .from("appointments")
    .select(APPOINTMENT_EMAIL_SELECT)
    .eq("id", appointmentId)
    .maybeSingle();
  if (error || !data) return null;
  return contextFromRow(data as Row);
}

// Called from AppointmentRepository.book (on a `confirmed` insert) and from
// the H3 PATCH route (on a `requested` -> `confirmed` transition).
export async function notifyAppointmentConfirmed(
  supabase: SupabaseClient,
  appointmentId: string,
): Promise<void> {
  try {
    const ctx = await loadContext(supabase, appointmentId);
    if (!ctx) return;
    const email = renderConfirmationEmail(ctx.data);
    await sendEmail({ to: ctx.to, ...email });
  } catch (err) {
    console.error("notifyAppointmentConfirmed failed", err);
  }
}

// Called from the H3 PATCH route when a `requested` booking is declined
// (status -> `cancelled` with a cancellation_reason, K7).
export async function notifyAppointmentDeclined(
  supabase: SupabaseClient,
  appointmentId: string,
): Promise<void> {
  try {
    const ctx = await loadContext(supabase, appointmentId);
    if (!ctx) return;
    const email = renderDeclinedEmail(ctx.data);
    await sendEmail({ to: ctx.to, ...email });
  } catch (err) {
    console.error("notifyAppointmentDeclined failed", err);
  }
}

// Called from the R4 reminder cron, which has already selected the row (so
// it passes it in rather than re-fetching by id). Three outcomes so the
// cron knows what to do with reminder_sent_at:
//   "sent"    -- email went out; mark the row so it isn't sent again.
//   "skipped" -- nothing to send (no customer email); mark it too, so a
//                permanently-unsendable row isn't retried every hour.
//   "failed"  -- provider rejected it; leave reminder_sent_at null so the
//                next hourly run retries (idempotent by design).
export async function sendReminderForRow(row: Row): Promise<"sent" | "skipped" | "failed"> {
  try {
    const ctx = contextFromRow(row);
    if (!ctx) return "skipped";
    const email = renderReminderEmail(ctx.data);
    const result = await sendEmail({ to: ctx.to, ...email });
    return result.ok ? "sent" : "failed";
  } catch (err) {
    console.error("sendReminderForRow failed", err);
    return "failed";
  }
}

export const REMINDER_ROW_SELECT = APPOINTMENT_EMAIL_SELECT;
export type ReminderRow = Row;
