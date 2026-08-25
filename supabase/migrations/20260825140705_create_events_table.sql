-- event_type: the three trackable behaviors from spec §14-15
create type public.event_type as enum ('buying_intent', 'product_recommendation', 'checkout_click');

-- events: append-only log of buying-intent, product-recommendation, and
-- checkout-click events. A shared table (not one per type) keeps analytics
-- aggregation (spec §15) a single group-by-type query.
create table public.events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  agent_id uuid references public.agents(id) on delete set null,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  type public.event_type not null,
  -- tracking_id: the sidde.link/c/{tracking-id} lookup key, set on checkout_click
  -- rows when the link is created (ticket C4) and read back on click (ticket E1).
  tracking_id varchar,
  -- metadata: type-specific extras (e.g. destination_url for checkout_click)
  -- that don't warrant a dedicated column.
  metadata jsonb,
  created_at timestamptz not null default now()
);

create index events_company_id_idx on public.events(company_id);
create index events_conversation_id_idx on public.events(conversation_id);
create index events_type_idx on public.events(type);
create unique index events_tracking_id_key on public.events(tracking_id) where tracking_id is not null;

-- Append-only: no updated_at column, no update trigger, no update/delete policies.
alter table public.events enable row level security;

create policy "Company members can view events"
on public.events for select
using (private.is_company_member(company_id));

create policy "Company members can create events"
on public.events for insert
with check (private.is_company_member(company_id));
