// Shared by the Server Component page and the Client Components under it.
//
// This file deliberately has NO "use client" directive. A value exported
// from a client module reaches a Server Component as a *client reference
// proxy*, not the value itself — importing APPOINTMENT_SELECT from
// appointments-manager.tsx handed supabase-js a proxy and blew up with
// "(intermediate value).split is not a function" inside `.select()`. The
// build can't catch it: the types line up, and it only fails at request
// time. Anything both sides need lives here, not in a "use client" file.

export const APPOINTMENT_SELECT = "*, services(name), customers(name, phone)";

export const APPOINTMENT_STATUSES = [
  "requested",
  "confirmed",
  "cancelled",
  "completed",
  "no_show",
] as const;

export type AppointmentStatus = (typeof APPOINTMENT_STATUSES)[number];

export type Appointment = {
  id: string;
  company_id: string;
  service_id: string | null;
  customer_id: string;
  conversation_id: string | null;
  agent_id: string | null;
  status: AppointmentStatus;
  starts_at: string;
  ends_at: string;
  google_event_id: string | null;
  notes: string | null;
  cancellation_reason: string | null;
  created_at: string;
  updated_at: string;
  // to-one embeds; `services` is null when the service was soft-deleted
  // after the booking (service_id is nullable and survives it)
  services: { name: string } | null;
  customers: { name: string | null; phone: string | null } | null;
};
