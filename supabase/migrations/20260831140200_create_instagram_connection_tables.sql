-- Trello N1: Instagram connection state. Structurally close to D1's
-- company_whatsapp_connections (20260826104820) -- same status enum, same
-- RLS shape, same column-level lockdown on the token -- with one deliberate
-- difference: this table is per *agent*, not per company.
--
-- Why per agent: web chat is already per agent (/talk/{company}/{agent}),
-- so a hired employee's connections page means "how customers reach this
-- employee". A company-wide Instagram row would break that reading and
-- reintroduce the routing question ("which agent answers?") that this
-- shape answers for free. A company with two Instagram accounts can point
-- one at Ana and the other at Malu. See decisions.md 2026-08-31.

create type public.instagram_connection_status as enum ('pending', 'connected', 'disconnected');

create table public.company_instagram_connections (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  agent_id uuid not null references public.agents(id) on delete cascade,
  -- The merchant's Instagram professional account id, as Meta reports it.
  -- This is what N4's webhook payload arrives carrying, so it is the
  -- lookup key for "who does this DM belong to".
  instagram_user_id varchar not null,
  username varchar,
  status public.instagram_connection_status not null default 'pending',
  access_token text,
  -- Instagram long-lived tokens expire after 60 days and, unlike WhatsApp's,
  -- can be refreshed before they do (N6). D1 records the same column and
  -- renews nothing; here the renewal is not optional, because a silently
  -- dead connection is an employee who stops answering.
  token_expires_at timestamptz,
  connected_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz default now(),
  -- One connection per hire. Reconnecting overwrites rather than stacking.
  unique (company_id, agent_id)
);

create index company_instagram_connections_company_id_idx
  on public.company_instagram_connections(company_id);

-- One Instagram account answers exactly one agent, platform-wide.
--
-- This is not a preference, it is what makes N4 possible: the inbound
-- webhook identifies the business only by its Instagram account id, so if
-- two rows claimed the same account there would be no criterion to decide
-- which agent -- or which company -- the message belongs to. Meta delivers
-- that webhook once; the schema has to agree there is one answer.
--
-- Partial, excluding 'disconnected': a merchant who disconnects an account
-- must be able to reconnect it, here or on another agent, and the old row
-- is kept (rather than deleted) so connected_at/created_at history survives.
create unique index company_instagram_connections_account_idx
  on public.company_instagram_connections (instagram_user_id)
  where status <> 'disconnected';

create trigger set_company_instagram_connections_updated_at
before update on public.company_instagram_connections
for each row execute function public.set_updated_at();

alter table public.company_instagram_connections enable row level security;

create policy "Company members can view their Instagram connections"
on public.company_instagram_connections for select
using (private.is_company_member(company_id));

create policy "Company admins can connect Instagram"
on public.company_instagram_connections for insert
with check (private.is_company_admin(company_id));

create policy "Company admins can update their Instagram connections"
on public.company_instagram_connections for update
using (private.is_company_admin(company_id));

create policy "Company admins can disconnect Instagram"
on public.company_instagram_connections for delete
using (private.is_company_admin(company_id));

-- Column-level lockdown on access_token, same technique and same reasoning
-- as D1's (20260826104820): 20260825171500 sets `alter default privileges`
-- so every new table in this schema is born with a table-wide DML grant to
-- anon/authenticated. A column-level revoke layered on top of a table-wide
-- grant is a no-op in Postgres -- the table-wide privilege supersedes it --
-- so the table-wide grant has to be revoked outright and re-granted back
-- per column, naming every column except access_token.
--
-- The effect is that `select access_token` errors with 42501 for every
-- regular client regardless of row-level access, while every other column
-- on the same row still follows the member/admin RLS above. Only the
-- service-role client (src/lib/supabase/service.ts) can read or write it.
revoke select, insert, update on public.company_instagram_connections from authenticated, anon;

grant select (
  id, company_id, agent_id, instagram_user_id, username, status,
  token_expires_at, connected_at, created_at, updated_at
), insert (
  id, company_id, agent_id, instagram_user_id, username, status,
  token_expires_at, connected_at, created_at, updated_at
), update (
  id, company_id, agent_id, instagram_user_id, username, status,
  token_expires_at, connected_at, created_at, updated_at
)
on public.company_instagram_connections
to authenticated, anon;
