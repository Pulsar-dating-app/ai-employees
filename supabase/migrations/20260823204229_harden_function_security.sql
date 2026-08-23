-- Fix mutable search_path on the updated_at trigger function
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Move internal helper/trigger functions to a non-exposed schema so they
-- cannot be invoked directly via PostgREST RPC (only "public" is API-exposed),
-- while remaining callable from RLS policies and DB triggers.
create schema if not exists private;

-- Drop policies that depend on the functions being moved
drop policy "Company members can view their company" on public.companies;
drop policy "Company admins can update their company" on public.companies;

drop policy "Company members can view membership" on public.company_users;
drop policy "Users can join a company as themselves, admins can add members" on public.company_users;
drop policy "Company admins can update membership" on public.company_users;
drop policy "Company admins can remove membership" on public.company_users;

drop policy "Company members can view hired agents" on public.company_agents;
drop policy "Company members can hire agents" on public.company_agents;
drop policy "Company members can update hired agents" on public.company_agents;
drop policy "Company members can remove hired agents" on public.company_agents;

drop policy "Company members can view customers" on public.customers;
drop policy "Company members can create customers" on public.customers;
drop policy "Company members can update customers" on public.customers;
drop policy "Company members can delete customers" on public.customers;

drop policy "Company members can view conversations" on public.conversations;
drop policy "Company members can create conversations" on public.conversations;
drop policy "Company members can update conversations" on public.conversations;
drop policy "Company members can delete conversations" on public.conversations;

drop policy "Company members can view products" on public.products;
drop policy "Company members can create products" on public.products;
drop policy "Company members can update products" on public.products;
drop policy "Company members can delete products" on public.products;

drop trigger on_auth_user_created on auth.users;

drop function public.is_company_member(uuid);
drop function public.is_company_admin(uuid);
drop function public.handle_new_user();

create function private.is_company_member(target_company_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.company_users cu
    where cu.company_id = target_company_id
      and cu.user_id = auth.uid()
  );
$$;

create function private.is_company_admin(target_company_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.company_users cu
    where cu.company_id = target_company_id
      and cu.user_id = auth.uid()
      and cu.role in ('owner', 'admin')
  );
$$;

create function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.users (id, email, name)
  values (new.id, new.email, new.raw_user_meta_data ->> 'name')
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function private.handle_new_user();

-- Recreate policies against the relocated helper functions
create policy "Company members can view their company"
on public.companies for select
using (private.is_company_member(id));

create policy "Company admins can update their company"
on public.companies for update
using (private.is_company_admin(id));

create policy "Company members can view membership"
on public.company_users for select
using (private.is_company_member(company_id));

create policy "Users can join a company as themselves, admins can add members"
on public.company_users for insert
with check (user_id = auth.uid() or private.is_company_admin(company_id));

create policy "Company admins can update membership"
on public.company_users for update
using (private.is_company_admin(company_id));

create policy "Company admins can remove membership"
on public.company_users for delete
using (private.is_company_admin(company_id));

create policy "Company members can view hired agents"
on public.company_agents for select
using (private.is_company_member(company_id));

create policy "Company members can hire agents"
on public.company_agents for insert
with check (private.is_company_member(company_id));

create policy "Company members can update hired agents"
on public.company_agents for update
using (private.is_company_member(company_id));

create policy "Company members can remove hired agents"
on public.company_agents for delete
using (private.is_company_member(company_id));

create policy "Company members can view customers"
on public.customers for select
using (private.is_company_member(company_id));

create policy "Company members can create customers"
on public.customers for insert
with check (private.is_company_member(company_id));

create policy "Company members can update customers"
on public.customers for update
using (private.is_company_member(company_id));

create policy "Company members can delete customers"
on public.customers for delete
using (private.is_company_member(company_id));

create policy "Company members can view conversations"
on public.conversations for select
using (private.is_company_member(company_id));

create policy "Company members can create conversations"
on public.conversations for insert
with check (private.is_company_member(company_id));

create policy "Company members can update conversations"
on public.conversations for update
using (private.is_company_member(company_id));

create policy "Company members can delete conversations"
on public.conversations for delete
using (private.is_company_member(company_id));

create policy "Company members can view products"
on public.products for select
using (private.is_company_member(company_id));

create policy "Company members can create products"
on public.products for insert
with check (private.is_company_member(company_id));

create policy "Company members can update products"
on public.products for update
using (private.is_company_member(company_id));

create policy "Company members can delete products"
on public.products for delete
using (private.is_company_member(company_id));
