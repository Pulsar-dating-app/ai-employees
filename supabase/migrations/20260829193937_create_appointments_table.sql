-- Trello H3 — appointments: the booking record. company_id/customer_id
-- follow the same required-and-cascades shape as events/conversations;
-- service_id/conversation_id/agent_id are nullable with on delete set null
-- so a booking's history survives its service, thread, or agent being
-- removed later (mirrors events.product_id/events.agent_id exactly).
create type public.appointment_status as enum (
  'requested',
  'confirmed',
  'cancelled',
  'completed',
  'no_show'
);

-- Needed for the EXCLUDE constraint below: btree_gist adds GiST support for
-- plain equality on scalar types (company_id here) so it can be combined
-- with the native GiST range-overlap operator in one index.
create extension if not exists btree_gist;

create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  service_id uuid references public.services(id) on delete set null,
  customer_id uuid not null references public.customers(id) on delete cascade,
  conversation_id uuid references public.conversations(id) on delete set null,
  agent_id uuid references public.agents(id) on delete set null,
  status public.appointment_status not null default 'confirmed',
  starts_at timestamptz not null,
  -- Deliberately includes the service's buffer_minutes, not just its
  -- duration — the calendar (and this table's own overlap constraint)
  -- should treat the buffer as reserved time too, so a practitioner never
  -- gets double-booked during their own cushion. A dashboard displaying
  -- "the appointment itself" (H3's future UI ticket, K4) needs to subtract
  -- the service's buffer_minutes back out for display.
  ends_at timestamptz not null,
  google_event_id varchar,
  notes text,
  cancellation_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz default now(),
  constraint appointments_ends_after_starts check (ends_at > starts_at),
  -- Structurally prevents two overlapping, still-live bookings for the same
  -- company — 'cancelled'/'no_show' free the slot back up, every other
  -- status (including 'requested') holds it while pending.
  exclude using gist (
    company_id with =,
    tstzrange(starts_at, ends_at, '[)') with &&
  ) where (status not in ('cancelled', 'no_show'))
);

create index appointments_company_id_idx on public.appointments(company_id);
create index appointments_customer_id_idx on public.appointments(customer_id);
create index appointments_service_id_idx on public.appointments(service_id);
create index appointments_status_idx on public.appointments(status);
create index appointments_starts_at_idx on public.appointments(starts_at);

create trigger set_appointments_updated_at
before update on public.appointments
for each row execute function public.set_updated_at();

alter table public.appointments enable row level security;

create policy "Company members can view appointments"
on public.appointments for select
using (private.is_company_member(company_id));

create policy "Company members can create appointments"
on public.appointments for insert
with check (private.is_company_member(company_id));

create policy "Company members can update appointments"
on public.appointments for update
using (private.is_company_member(company_id));

create policy "Company members can delete appointments"
on public.appointments for delete
using (private.is_company_member(company_id));
