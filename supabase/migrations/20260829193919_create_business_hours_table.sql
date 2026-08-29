-- Trello H2 — business_hours: a recurring weekly template of when a company
-- takes appointments. Deliberately no holiday/exception table — a day
-- blocked directly in the merchant's connected Google Calendar is already
-- "busy" and gets excluded by freebusy.query for free (Trello I2), so one
-- less table to keep in sync.
create table public.business_hours (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  day_of_week smallint not null,
  start_time time not null,
  end_time time not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz default now(),
  constraint business_hours_day_of_week_check check (day_of_week between 0 and 6),
  constraint business_hours_end_after_start check (end_time > start_time),
  -- Unique on (company, day, start) rather than just (company, day) --
  -- allows split shifts, e.g. 09:00-12:00 and 14:00-18:00 the same day.
  constraint business_hours_unique_start unique (company_id, day_of_week, start_time)
);

create index business_hours_company_id_idx on public.business_hours(company_id);

create trigger set_business_hours_updated_at
before update on public.business_hours
for each row execute function public.set_updated_at();

alter table public.business_hours enable row level security;

create policy "Company members can view business hours"
on public.business_hours for select
using (private.is_company_member(company_id));

create policy "Company members can create business hours"
on public.business_hours for insert
with check (private.is_company_member(company_id));

create policy "Company members can update business hours"
on public.business_hours for update
using (private.is_company_member(company_id));

create policy "Company members can delete business hours"
on public.business_hours for delete
using (private.is_company_member(company_id));
