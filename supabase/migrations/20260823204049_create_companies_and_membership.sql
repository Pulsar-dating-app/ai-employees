-- companies: one row per merchant business using Sidde
create table public.companies (
  id uuid primary key default gen_random_uuid(),
  name varchar,
  email varchar,
  phone varchar,
  website_url varchar,
  description text,
  shipping_policy text,
  return_policy text,
  payment_policy text,
  faq jsonb,
  additional_information text,
  currency varchar(3),
  country varchar,
  timezone varchar,
  created_at timestamptz not null default now(),
  updated_at timestamptz default now()
);

create trigger set_companies_updated_at
before update on public.companies
for each row execute function public.set_updated_at();

alter table public.companies enable row level security;

-- company_users: membership linking a user to a company with a role
create table public.company_users (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  role varchar check (role in ('owner', 'admin', 'member')),
  created_at timestamptz not null default now(),
  updated_at timestamptz default now(),
  unique (company_id, user_id)
);

create index company_users_company_id_idx on public.company_users(company_id);
create index company_users_user_id_idx on public.company_users(user_id);

create trigger set_company_users_updated_at
before update on public.company_users
for each row execute function public.set_updated_at();

alter table public.company_users enable row level security;

-- Helper functions (security definer to avoid recursive RLS evaluation)
create or replace function public.is_company_member(target_company_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.company_users cu
    where cu.company_id = target_company_id
      and cu.user_id = auth.uid()
  );
$$;

create or replace function public.is_company_admin(target_company_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.company_users cu
    where cu.company_id = target_company_id
      and cu.user_id = auth.uid()
      and cu.role in ('owner', 'admin')
  );
$$;

-- companies policies
create policy "Company members can view their company"
on public.companies for select
using (public.is_company_member(id));

create policy "Authenticated users can create a company"
on public.companies for insert
with check (auth.uid() is not null);

create policy "Company admins can update their company"
on public.companies for update
using (public.is_company_admin(id));

-- company_users policies
create policy "Company members can view membership"
on public.company_users for select
using (public.is_company_member(company_id));

create policy "Users can join a company as themselves, admins can add members"
on public.company_users for insert
with check (user_id = auth.uid() or public.is_company_admin(company_id));

create policy "Company admins can update membership"
on public.company_users for update
using (public.is_company_admin(company_id));

create policy "Company admins can remove membership"
on public.company_users for delete
using (public.is_company_admin(company_id));
