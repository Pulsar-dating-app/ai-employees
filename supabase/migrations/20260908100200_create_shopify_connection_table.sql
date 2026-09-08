-- Shopify catalog connection state. Structurally a close copy of I1's
-- company_calendar_connections (migration 20260829201627) -- same
-- member-read / admin-write RLS shape, same column-level lockdown on the
-- token -- with these deliberate differences:
--
--  * per COMPANY, not per agent. The products table is company-scoped
--    (no agent_id) and only Malu consumes it, so a Shopify store is a
--    company-wide catalogue source, not a per-hire channel the way
--    Instagram/WhatsApp are. See decisions.md.
--  * the access_token is PERMANENT (Shopify offline tokens don't expire),
--    so there is no token_expires_at and no refresh cron.
--  * shop_domain (the merchant's `*.myshopify.com` host) is the webhook
--    lookup key -- what an inbound app/uninstalled or shop/redact delivery
--    arrives carrying in the X-Shopify-Shop-Domain header.

create type public.shopify_connection_status as enum ('pending', 'connected', 'disconnected');

create table public.company_shopify_connections (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  shop_domain varchar not null,
  shop_name varchar,
  -- The store's own currency, read from the Shopify shop once on connect.
  -- Synced product rows are written with this currency (Shopify prices are
  -- always in the shop currency and the product payload never repeats it).
  currency varchar(3),
  -- The scope string Shopify actually granted, echoed back by the token
  -- exchange. Stored for display / drift detection, never trusted for auth.
  scope varchar,
  status public.shopify_connection_status not null default 'pending',
  access_token text,
  connected_at timestamptz,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz default now(),
  -- One Shopify store per company; reconnecting overwrites this row rather
  -- than stacking.
  unique (company_id)
);

create index company_shopify_connections_company_id_idx
  on public.company_shopify_connections(company_id);

-- One store answers exactly one company, platform-wide: the inbound
-- compliance / uninstall webhook identifies the merchant only by shop
-- domain, so two live rows for one store would leave no criterion for
-- whose catalogue to touch. Partial (excludes 'disconnected') so a merchant
-- who disconnects can reconnect the same store -- here or under another
-- company -- while the old row's connected_at/created_at history survives.
create unique index company_shopify_connections_shop_domain_idx
  on public.company_shopify_connections (shop_domain)
  where status <> 'disconnected';

create trigger set_company_shopify_connections_updated_at
before update on public.company_shopify_connections
for each row execute function public.set_updated_at();

alter table public.company_shopify_connections enable row level security;

create policy "Company members can view their Shopify connection"
on public.company_shopify_connections for select
using (private.is_company_member(company_id));

create policy "Company admins can connect Shopify"
on public.company_shopify_connections for insert
with check (private.is_company_admin(company_id));

create policy "Company admins can update their Shopify connection"
on public.company_shopify_connections for update
using (private.is_company_admin(company_id));

create policy "Company admins can disconnect Shopify"
on public.company_shopify_connections for delete
using (private.is_company_admin(company_id));

-- Column-level lockdown on access_token, same technique and reasoning as
-- I1's / D1's: a schema-wide `alter default privileges` (20260825171500)
-- grants every new table table-wide DML to anon/authenticated, and a
-- column-level revoke on top of that is a no-op in Postgres -- so the
-- table-wide grant is revoked outright and re-granted per column, naming
-- every column except access_token. Only src/lib/supabase/service.ts's
-- service-role client can read or write the token; every other column
-- still follows the member/admin RLS above.
revoke select, insert, update on public.company_shopify_connections from authenticated, anon;

grant select (
  id, company_id, shop_domain, shop_name, currency, scope, status,
  connected_at, last_synced_at, created_at, updated_at
), insert (
  id, company_id, shop_domain, shop_name, currency, scope, status,
  connected_at, last_synced_at, created_at, updated_at
), update (
  id, company_id, shop_domain, shop_name, currency, scope, status,
  connected_at, last_synced_at, created_at, updated_at
)
on public.company_shopify_connections
to authenticated, anon;
