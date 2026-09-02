-- Trello J5 + J7 -- columns for the appointment-lifecycle work.
--
-- customers.email (J5): the cross-device / cross-session lookup key. A
-- web-chat customer is otherwise only identifiable by `web_chat_session_id`
-- (a per-browser value); an email lets list_my_appointments find their
-- bookings again from another device. Nullable, and NOT populated by this
-- PR -- Ana starts collecting it in the R2 intake redesign (email becomes a
-- required predefined field). Adding the column now so J5's lookup path
-- exists and R2 only has to fill it.
alter table public.customers
  add column email text;

-- Company-wide scheduling policy (J7), same granularity as
-- requires_appointment_approval. Both default to 0 = no restriction, so
-- this migration changes nothing until a merchant sets a value.
--
--   min_lead_time_minutes    -- a customer can't book a slot starting
--                               sooner than this many minutes from now.
--                               find_available_slots stops offering them and
--                               book_appointment rejects with "too_soon".
--   cancellation_cutoff_hours -- a customer can't self-cancel inside this
--                                many hours before the start; cancel_appointment
--                                rejects with "cutoff_passed" and Ana points
--                                them at the team.
--
-- Enforced only on Ana's tool path (AppointmentRepository), never on the
-- merchant dashboard's own H3 routes -- a merchant booking or cancelling on
-- someone's behalf is trusted. See decisions.md 2026-09-02.
alter table public.companies
  add column min_lead_time_minutes integer not null default 0
    check (min_lead_time_minutes >= 0 and min_lead_time_minutes <= 43200),   -- <= 30 days
  add column cancellation_cutoff_hours integer not null default 0
    check (cancellation_cutoff_hours >= 0 and cancellation_cutoff_hours <= 8760); -- <= 1 year
