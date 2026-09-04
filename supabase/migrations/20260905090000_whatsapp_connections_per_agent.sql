-- Trello D1 amendment (2026-09-04) -- mirrors N1's per-agent departure for
-- Instagram. company_whatsapp_connections was originally company-wide,
-- which leaves no criterion for deciding which hired agent answers a
-- WhatsApp number once a company has more than one active hire (K6's
-- original "which agent answers?" job was dissolved for Instagram by going
-- per-agent; WhatsApp never got the same fix because D2/D4 -- the pieces
-- that would have surfaced the gap -- weren't built yet). No real
-- connections exist in any environment (D2/D4 were never built, so nothing
-- ever wrote a row outside manual dev testing), so this is a straight
-- schema change, not a backfill.

alter table public.company_whatsapp_connections
  add column agent_id uuid references public.agents(id) on delete cascade;

alter table public.company_whatsapp_connections
  drop constraint company_whatsapp_connections_company_id_key;

alter table public.company_whatsapp_connections
  alter column agent_id set not null;

alter table public.company_whatsapp_connections
  add constraint company_whatsapp_connections_company_id_agent_id_key
  unique (company_id, agent_id);

-- One WhatsApp number answers exactly one agent, platform-wide -- same
-- reasoning and shape as N1's instagram_user_id partial unique index: the
-- inbound webhook (D2) identifies the business only by phone_number_id, and
-- Meta delivers a message once, so two rows claiming the same number would
-- leave no criterion for choosing between them. Partial on status so
-- disconnect-then-reconnect (including moving a number to a different
-- agent) doesn't fight the index.
create unique index company_whatsapp_connections_phone_number_id_idx
  on public.company_whatsapp_connections (phone_number_id)
  where status <> 'disconnected';

-- agent_id needs the same read/write access as every other non-sensitive
-- column on this table (see the column-privilege lockdown in
-- 20260826104820 -- access_token/two_step_pin stay locked, everything else
-- is granted).
grant select (agent_id), insert (agent_id), update (agent_id)
on public.company_whatsapp_connections
to authenticated, anon;
