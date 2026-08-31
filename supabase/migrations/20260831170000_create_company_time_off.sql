-- Company time off: merchant-registered periods where nobody is available
-- for appointments (vacation, travel — the reason is optional and free-text).
--
-- This is the "exceptions table" H2 deliberately left out (see the
-- 2026-08-29 decisions.md entry), added once a real need showed up: a
-- company running without a connected Google Calendar still has to be able
-- to close specific dates ahead of time, not just flip the weekly toggle.
-- The recurring weekly template stays in `business_hours`; this table only
-- carries one-off date ranges.
--
-- Whole-day granularity: inclusive `start_date`/`end_date`, no time-of-day.
-- The availability engine converts each range to a half-open UTC interval
-- at the company's timezone ([local 00:00 of start_date, local 00:00 of the
-- day after end_date)) and folds it into the same `busy` list as
-- appointments and Google free/busy.
create table public.company_time_off (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  start_date date not null,
  end_date date not null,
  reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz default now(),
  constraint company_time_off_end_after_start check (end_date >= start_date)
);

-- Filtered by company and, for the "upcoming" list, by end_date.
create index company_time_off_company_id_end_date_idx
  on public.company_time_off(company_id, end_date);

create trigger set_company_time_off_updated_at
before update on public.company_time_off
for each row execute function public.set_updated_at();

alter table public.company_time_off enable row level security;

-- Member-level, same as business_hours (H2): the scheduling routes only ever
-- call requireMember, never requireAdmin.
create policy "Company members can view time off"
on public.company_time_off for select
using (private.is_company_member(company_id));

create policy "Company members can create time off"
on public.company_time_off for insert
with check (private.is_company_member(company_id));

create policy "Company members can update time off"
on public.company_time_off for update
using (private.is_company_member(company_id));

create policy "Company members can delete time off"
on public.company_time_off for delete
using (private.is_company_member(company_id));
