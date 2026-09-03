-- Trello R5 -- waitlist: "let me know if something opens up on Friday".
-- Ana adds a row when find_available_slots comes back empty for the
-- customer's preferred window; when an appointment is later cancelled
-- (freeing a slot) the cancel paths look here for the oldest still-waiting
-- match in that window and email that one customer (R1). MVP: notify only,
-- never auto-hold the slot.
--
-- company_id / customer_id / service_id follow the appointments table:
-- required, cascade-delete (a waitlist entry has no meaning without any of
-- them). conversation_id / agent_id are nullable set-null context for a
-- future dashboard view, same as appointments.
create table public.appointment_waitlist (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  service_id uuid not null references public.services(id) on delete cascade,
  conversation_id uuid references public.conversations(id) on delete set null,
  agent_id uuid references public.agents(id) on delete set null,
  -- Inclusive local (business-timezone) date range the customer is waiting
  -- on. A one-day wait is desired_from = desired_to.
  desired_from date not null,
  desired_to date not null,
  created_at timestamptz not null default now(),
  -- NULL = still waiting. Stamped once we successfully email the customer
  -- that a slot opened; a notified entry is never matched again.
  notified_at timestamptz,
  constraint appointment_waitlist_range_ok check (desired_to >= desired_from)
);

-- The match query on cancel: still-waiting rows for one company+service
-- whose window covers the freed slot's local date, oldest first.
create index appointment_waitlist_match_idx
  on public.appointment_waitlist (company_id, service_id, desired_from, desired_to)
  where notified_at is null;

create index appointment_waitlist_customer_id_idx
  on public.appointment_waitlist (customer_id);

-- One open entry per customer + service + exact window -- re-asking just
-- keeps the original spot in line (the tool reports alreadyWaiting).
create unique index appointment_waitlist_open_dedupe_idx
  on public.appointment_waitlist (company_id, customer_id, service_id, desired_from, desired_to)
  where notified_at is null;

alter table public.appointment_waitlist enable row level security;

-- Ana writes through the service-role client (bypasses RLS), same as every
-- other appointment write on her path. These policies exist for a future
-- merchant-facing view of who's waiting.
create policy "Company members can view waitlist entries"
on public.appointment_waitlist for select
using (private.is_company_member(company_id));

create policy "Company members can create waitlist entries"
on public.appointment_waitlist for insert
with check (private.is_company_member(company_id));

create policy "Company members can update waitlist entries"
on public.appointment_waitlist for update
using (private.is_company_member(company_id));

create policy "Company members can delete waitlist entries"
on public.appointment_waitlist for delete
using (private.is_company_member(company_id));
