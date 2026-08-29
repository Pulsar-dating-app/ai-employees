-- Trello H1 — services: the bookable offerings a company's scheduling agent
-- (Ana) draws on, same role products plays for Malu. Deliberately company-
-- scoped, not agent-scoped — a fact about the business, not about who's
-- hired, same reasoning as products.
create table public.services (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name varchar not null,
  description text,
  duration_minutes integer not null,
  buffer_minutes integer not null default 0,
  price decimal(12,2),
  currency varchar(3),
  category varchar,
  is_active boolean not null default true,
  metadata jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz default now()
);

create index services_company_id_idx on public.services(company_id);
create index services_is_active_idx on public.services(is_active);

create trigger set_services_updated_at
before update on public.services
for each row execute function public.set_updated_at();

alter table public.services enable row level security;

create policy "Company members can view services"
on public.services for select
using (private.is_company_member(company_id));

create policy "Company members can create services"
on public.services for insert
with check (private.is_company_member(company_id));

create policy "Company members can update services"
on public.services for update
using (private.is_company_member(company_id));

create policy "Company members can delete services"
on public.services for delete
using (private.is_company_member(company_id));
