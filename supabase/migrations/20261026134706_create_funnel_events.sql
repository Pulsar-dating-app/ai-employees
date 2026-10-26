-- Funnel events (2026-10-26): what merchants actually do in the first
-- session and after it -- which onboarding step they reach, whether they
-- copy or share the hosted link, which channel panel they open, whether they
-- come back. Until now the only signals were derived from rows (a company
-- exists, a service exists), which says where someone stopped but nothing
-- about what they tried. The event names are allowlisted in code
-- (src/lib/funnel/events.ts); this table only bounds their shape.
--
-- Insert-only for the merchant, and only as themselves into a company they
-- belong to. Nobody reads it through the API: it's for SQL/analysis with the
-- service role, so there are no select/update/delete policies.
create table public.funnel_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  event text not null check (event ~ '^[a-z][a-z_]{0,63}$'),
  properties jsonb not null default '{}'::jsonb
    check (jsonb_typeof(properties) = 'object' and octet_length(properties::text) <= 2048),
  created_at timestamptz not null default now()
);

create index funnel_events_company_id_created_at_idx on public.funnel_events (company_id, created_at);
create index funnel_events_event_created_at_idx on public.funnel_events (event, created_at);
create index funnel_events_user_id_idx on public.funnel_events (user_id);

alter table public.funnel_events enable row level security;

create policy "Members record their own funnel events"
on public.funnel_events for insert
to authenticated
with check (
  user_id = (select auth.uid())
  and (company_id is null or private.is_company_member(company_id))
);

revoke select, update, delete on public.funnel_events from authenticated, anon;
revoke insert on public.funnel_events from anon;
