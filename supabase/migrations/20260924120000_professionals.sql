-- 2026-09-24 -- Multiple schedules per company, one per professional (see
-- decisions.md). Until now every scheduling table was company-wide: one
-- weekly schedule, one time-off list, one Google Calendar, and an EXCLUDE
-- constraint that made two appointments at the same time impossible anywhere
-- in the company -- so a barbershop with 10 barbers could only ever book one
-- haircut at a time.
--
-- A `professional` is the bookable resource (a barber, a doctor). Every
-- company gets one seeded automatically, and every existing row is
-- backfilled onto it, so a single-professional company behaves exactly as
-- before. Rules:
--   - appointments: overlap is now per professional, not per company.
--   - business_hours: professional_id NULL = the establishment's hours; a
--     professional with uses_custom_hours = true uses its own rows instead.
--   - company_time_off: professional_id NULL = the whole establishment is
--     closed; otherwise only that professional is away.
--   - appointment_waitlist: professional_id NULL = any professional.
--   - company_calendar_connections: one Google connection per professional
--     (each can use a different Google account and calendar).
--   - professional_services: which professionals perform a service; a
--     service with no rows here is performed by everyone.
--
-- professional_id references (id, company_id) everywhere, so a row can never
-- point at another company's professional.

create table public.professionals (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  is_active boolean not null default true,
  position integer not null default 0,
  -- false = follows the establishment's business_hours; true = uses the
  -- business_hours rows carrying this professional's id (possibly none,
  -- meaning "not working any day").
  uses_custom_hours boolean not null default false,
  -- Optional link to a team member who manages this professional's own
  -- schedule (hours, time off, Google) without being a company admin.
  user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint professionals_name_not_blank check (btrim(name) <> '' and char_length(name) <= 120),
  constraint professionals_id_company_key unique (id, company_id)
);

create index professionals_company_id_idx on public.professionals (company_id, position);

create unique index professionals_one_per_user_idx
  on public.professionals (company_id, user_id)
  where user_id is not null;

create trigger set_professionals_updated_at
before update on public.professionals
for each row execute function public.set_updated_at();

-- Readable by every company member (the dashboard and the agenda filter
-- need the names); written only by the API through the service-role client,
-- which enforces admin vs. linked-member rules -- same posture as the
-- connection tables since 20260922100000 / 20260922120001.
alter table public.professionals enable row level security;

create policy "Company members can view professionals"
on public.professionals for select
using (private.is_company_member(company_id));

revoke insert, update, delete on public.professionals from authenticated, anon;

create table public.professional_services (
  professional_id uuid not null,
  service_id uuid not null references public.services(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (professional_id, service_id),
  constraint professional_services_professional_fk
    foreign key (professional_id, company_id)
    references public.professionals (id, company_id) on delete cascade
);

create index professional_services_service_id_idx on public.professional_services (service_id);

alter table public.professional_services enable row level security;

create policy "Company members can view professional services"
on public.professional_services for select
using (private.is_company_member(company_id));

revoke insert, update, delete on public.professional_services from authenticated, anon;

-- Seed: one professional per company, named after the company (a solo
-- practitioner's business is usually them; it's renamable either way, and a
-- single-professional company never shows the name to its customers).
create or replace function private.seed_default_professional(p_company_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.professionals where company_id = p_company_id) then
    insert into public.professionals (company_id, name)
    select c.id, left(coalesce(nullif(btrim(c.name), ''), 'Profissional'), 120)
    from public.companies c
    where c.id = p_company_id;
  end if;
end $$;

create or replace function private.on_company_created_seed_default_professional()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.seed_default_professional(new.id);
  return new;
end $$;

create trigger seed_default_professional_after_company_insert
after insert on public.companies
for each row execute function private.on_company_created_seed_default_professional();

select private.seed_default_professional(id) from public.companies;

-- ---------------------------------------------------------------------------
-- appointments
-- ---------------------------------------------------------------------------

alter table public.appointments
  add column professional_id uuid,
  -- The Google calendar the event was created in, copied at sync time, so a
  -- later reschedule/cancel still targets the right calendar even if the
  -- professional has since switched calendars.
  add column google_calendar_id text;

update public.appointments a
set professional_id = p.id
from public.professionals p
where p.company_id = a.company_id and a.professional_id is null;

alter table public.appointments
  alter column professional_id set not null,
  add constraint appointments_professional_fk
    foreign key (professional_id, company_id)
    references public.professionals (id, company_id);

-- The overlap guard moves from "one booking at a time per company" to "one
-- booking at a time per professional". Same semantics otherwise: ends_at
-- includes the service buffer, and 'cancelled'/'no_show' free the slot.
alter table public.appointments drop constraint appointments_company_id_tstzrange_excl;

alter table public.appointments
  add constraint appointments_professional_overlap_excl
  exclude using gist (
    professional_id with =,
    tstzrange(starts_at, ends_at, '[)') with &&
  ) where (status not in ('cancelled', 'no_show'));

create index appointments_professional_starts_at_idx on public.appointments (professional_id, starts_at);

-- A company with exactly one active professional never has to name it: an
-- insert without professional_id gets that professional. With several, the
-- caller must choose, and the NOT NULL above rejects the insert.
create or replace function private.default_appointment_professional()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if new.professional_id is null then
    select case when count(*) = 1 then (array_agg(p.id))[1] end into v_id
    from public.professionals p
    where p.company_id = new.company_id and p.is_active;
    new.professional_id := v_id;
  end if;
  return new;
end $$;

create trigger default_appointment_professional_before_insert
before insert on public.appointments
for each row execute function private.default_appointment_professional();

-- ---------------------------------------------------------------------------
-- business_hours
-- ---------------------------------------------------------------------------

alter table public.business_hours
  add column professional_id uuid,
  add constraint business_hours_professional_fk
    foreign key (professional_id, company_id)
    references public.professionals (id, company_id) on delete cascade;

alter table public.business_hours drop constraint business_hours_unique_start;

create unique index business_hours_company_unique_start
  on public.business_hours (company_id, day_of_week, start_time)
  where professional_id is null;

create unique index business_hours_professional_unique_start
  on public.business_hours (professional_id, day_of_week, start_time)
  where professional_id is not null;

-- ---------------------------------------------------------------------------
-- company_time_off
-- ---------------------------------------------------------------------------

alter table public.company_time_off
  add column professional_id uuid,
  add constraint company_time_off_professional_fk
    foreign key (professional_id, company_id)
    references public.professionals (id, company_id) on delete cascade;

-- ---------------------------------------------------------------------------
-- appointment_waitlist
-- ---------------------------------------------------------------------------

alter table public.appointment_waitlist
  add column professional_id uuid,
  add constraint appointment_waitlist_professional_fk
    foreign key (professional_id, company_id)
    references public.professionals (id, company_id) on delete cascade;

drop index public.appointment_waitlist_open_dedupe_idx;

create unique index appointment_waitlist_open_dedupe_idx
  on public.appointment_waitlist (
    company_id, customer_id, service_id,
    coalesce(professional_id, '00000000-0000-0000-0000-000000000000'::uuid),
    desired_from, desired_to
  )
  where notified_at is null;

-- ---------------------------------------------------------------------------
-- company_calendar_connections: one per professional
-- ---------------------------------------------------------------------------

alter table public.company_calendar_connections add column professional_id uuid;

update public.company_calendar_connections cc
set professional_id = p.id
from public.professionals p
where p.company_id = cc.company_id and cc.professional_id is null;

alter table public.company_calendar_connections
  alter column professional_id set not null,
  drop constraint company_calendar_connections_company_id_key,
  add constraint company_calendar_connections_professional_id_key unique (professional_id),
  add constraint company_calendar_connections_professional_fk
    foreign key (professional_id, company_id)
    references public.professionals (id, company_id) on delete cascade;

create index company_calendar_connections_company_id_idx on public.company_calendar_connections (company_id);

-- Same column-level read grant as every other non-secret column
-- (20260829201627); access_token/refresh_token stay locked.
grant select (professional_id) on public.company_calendar_connections to authenticated, anon;
