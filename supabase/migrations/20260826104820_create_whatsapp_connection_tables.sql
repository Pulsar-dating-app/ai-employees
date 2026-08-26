-- Trello D1: WhatsApp connection state. access_token lives on the same
-- table as the rest of the connection metadata, but is locked down with
-- explicit column-level privileges rather than a second table -- Postgres
-- enforces this per-column regardless of the row-level RLS policies below,
-- so a `select *` from a regular authenticated/anon client errors outright
-- instead of silently succeeding or omitting the column.

create type public.whatsapp_connection_status as enum ('pending', 'connected', 'disconnected');

create table public.company_whatsapp_connections (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  phone_number_id varchar not null,
  waba_id varchar not null,
  display_phone_number varchar,
  status public.whatsapp_connection_status not null default 'pending',
  access_token text,
  connected_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz default now(),
  unique (company_id)
);

create trigger set_company_whatsapp_connections_updated_at
before update on public.company_whatsapp_connections
for each row execute function public.set_updated_at();

alter table public.company_whatsapp_connections enable row level security;

create policy "Company members can view their WhatsApp connection"
on public.company_whatsapp_connections for select
using (private.is_company_member(company_id));

create policy "Company admins can connect WhatsApp"
on public.company_whatsapp_connections for insert
with check (private.is_company_admin(company_id));

create policy "Company admins can update their WhatsApp connection"
on public.company_whatsapp_connections for update
using (private.is_company_admin(company_id));

create policy "Company admins can disconnect WhatsApp"
on public.company_whatsapp_connections for delete
using (private.is_company_admin(company_id));

-- Column-level lockdown. A table-wide grant (like the blanket one in
-- 20260825171500) allows selecting/writing any column outright -- a
-- column-level revoke on top of it is a no-op, since table-wide privilege
-- and column-level privilege aren't a strict subtract, the former simply
-- supersedes the latter. So this must revoke the table-wide privilege
-- entirely and re-grant it back per-column, naming every column except
-- access_token. Only a service-role client (which bypasses grants and RLS
-- both) can read or write that column; see src/lib/supabase/service.ts.
-- Regular member/admin RLS above still governs every other column normally.
revoke select, insert, update on public.company_whatsapp_connections from authenticated, anon;

grant select (
  id, company_id, phone_number_id, waba_id, display_phone_number, status, connected_at, created_at, updated_at
), insert (
  id, company_id, phone_number_id, waba_id, display_phone_number, status, connected_at, created_at, updated_at
), update (
  id, company_id, phone_number_id, waba_id, display_phone_number, status, connected_at, created_at, updated_at
)
on public.company_whatsapp_connections
to authenticated, anon;
