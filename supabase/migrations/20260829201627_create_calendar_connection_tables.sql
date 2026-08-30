-- Trello I1: Google Calendar connection state. Structurally a close copy of
-- D1's company_whatsapp_connections (migration 20260826104820) -- same
-- member-read/admin-write RLS shape, same column-level lockdown technique --
-- except both access_token AND refresh_token are locked here (WhatsApp had
-- no refresh token). `provider` defaults to 'google' but isn't hardcoded
-- into the table name, so a second calendar provider later reuses this table
-- rather than needing a parallel one.

create type public.calendar_connection_status as enum ('pending', 'connected', 'disconnected');

create table public.company_calendar_connections (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  provider varchar not null default 'google',
  google_calendar_id varchar,
  status public.calendar_connection_status not null default 'pending',
  access_token text,
  refresh_token text,
  token_expires_at timestamptz,
  scopes text,
  connected_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz default now(),
  unique (company_id)
);

create trigger set_company_calendar_connections_updated_at
before update on public.company_calendar_connections
for each row execute function public.set_updated_at();

alter table public.company_calendar_connections enable row level security;

create policy "Company members can view their calendar connection"
on public.company_calendar_connections for select
using (private.is_company_member(company_id));

create policy "Company admins can connect a calendar"
on public.company_calendar_connections for insert
with check (private.is_company_admin(company_id));

create policy "Company admins can update their calendar connection"
on public.company_calendar_connections for update
using (private.is_company_admin(company_id));

create policy "Company admins can disconnect their calendar"
on public.company_calendar_connections for delete
using (private.is_company_admin(company_id));

-- Column-level lockdown (see D1's own migration comment for the full
-- reasoning: a column-level revoke on top of an existing table-wide grant is
-- a no-op, so the table-wide grant must be revoked first and re-granted back
-- per-column). Only src/lib/supabase/service.ts's service-role client can
-- read or write access_token/refresh_token; every other column follows the
-- normal member-read/admin-write RLS above.
revoke select, insert, update on public.company_calendar_connections from authenticated, anon;

grant select (
  id, company_id, provider, google_calendar_id, status, scopes, connected_at, token_expires_at, created_at, updated_at
), insert (
  id, company_id, provider, google_calendar_id, status, scopes, connected_at, token_expires_at, created_at, updated_at
), update (
  id, company_id, provider, google_calendar_id, status, scopes, connected_at, token_expires_at, created_at, updated_at
)
on public.company_calendar_connections
to authenticated, anon;
