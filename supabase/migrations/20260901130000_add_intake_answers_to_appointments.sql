-- Trello K9 — the answers Ana collected for the merchant's intake questions
-- (K8's appointment_intake_fields) before this booking. A flat
-- label -> answer map: { "Full name": "Ana Souza", "CPF": "123..." }.
-- Only questions the customer actually answered are stored (every required
-- one, plus any optional one they chose to answer). `{}` when the business
-- has no intake questions configured, or the booking predates K9.
--
-- Not a separate table: it's per-appointment, written once at booking time,
-- read back only for display on the K4 appointment row — the same shape and
-- reasoning as `appointments.notes`, just structured.
alter table public.appointments
  add column intake_answers jsonb not null default '{}'::jsonb;
