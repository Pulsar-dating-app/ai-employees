-- Trello P2 -- billing & usage schema. The database half of merchant
-- subscription billing (epic P): what plan a company is on, how many AI
-- replies it has spent this period, and an idempotency ledger for Stripe
-- webhooks. No Stripe calls here -- the P3 checkout route and the P4 webhook
-- are the only writers; P7 wires every inbound channel to record_ai_reply()
-- (the function lives in the sibling migration).
--
-- Billing unit = 1 AI reply, no weighting (every reply = 1). Teammates on
-- the account (company_users) are free and unlimited. Which bots run is the
-- K6 active/paused toggle, not a billing lever.

-- Stripe's subscription.status value set, verbatim. The P4 webhook stores
-- whatever Stripe sends, so every value Stripe can emit has to exist here or
-- the insert fails. `incomplete_expired` and `paused` aren't produced by our
-- own flows today, but Stripe still sends them (abandoned first payment;
-- pause-collection), and an enum is cheaper to over-populate now than to
-- ALTER under a failing webhook later.
create type public.stripe_subscription_status as enum (
  'incomplete',
  'incomplete_expired',
  'trialing',
  'active',
  'past_due',
  'canceled',
  'unpaid',
  'paused'
);

-- One row per company: the local mirror of its Stripe subscription, so bot
-- activation can be gated without a Stripe round-trip on every message.
create table public.company_billing (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  stripe_customer_id text,
  stripe_subscription_id text,
  -- Matches a key in src/lib/billing/plans.ts. Deliberately not an enum or
  -- FK: the plan catalog lives in code (P1 decision). A new plan is already
  -- a plans.ts + Stripe change, so a one-line bump to this CHECK alongside
  -- is acceptable -- and it guards against a mistyped key arriving from the
  -- webhook.
  plan_key text not null check (plan_key in ('starter', 'pro', 'enterprise')),
  subscription_status public.stripe_subscription_status not null,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz default now(),
  unique (company_id)
);

create trigger set_company_billing_updated_at
before update on public.company_billing
for each row execute function public.set_updated_at();

alter table public.company_billing enable row level security;

-- Members read their own company's billing state. Nobody writes it through a
-- regular client -- the P3 route and P4 webhook use the service-role client,
-- which bypasses RLS and grants both. The explicit revoke is defence in
-- depth on top of "no write policy exists", the same shape used for
-- company_whatsapp_connections (Trello D1).
create policy "Company members can view billing"
on public.company_billing for select
using (private.is_company_member(company_id));

revoke insert, update, delete on public.company_billing from authenticated, anon;

-- One row per company per billing period. A new period is a new row -- that
-- IS the "monthly reset": replies_used starts at 0 again. The P4 webhook
-- inserts it (at checkout, and on each Stripe renewal); the prior period's
-- row is left in place as usage history. record_ai_reply() only ever
-- increments an existing row, it never creates one.
create table public.company_message_usage (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  period_start timestamptz not null,
  replies_used integer not null default 0,
  -- Snapshot of the plan's monthly_reply_limit (src/lib/billing/plans.ts)
  -- taken when the period opened, so a mid-period plan change does not move
  -- this period's ceiling retroactively.
  reply_limit integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz default now(),
  unique (company_id, period_start)
);

create trigger set_company_message_usage_updated_at
before update on public.company_message_usage
for each row execute function public.set_updated_at();

alter table public.company_message_usage enable row level security;

create policy "Company members can view usage"
on public.company_message_usage for select
using (private.is_company_member(company_id));

revoke insert, update, delete on public.company_message_usage from authenticated, anon;

-- Idempotency ledger for the P4 webhook: insert the Stripe event id before
-- processing it; a 23505 on that insert means the event was already handled
-- (a redelivery or a concurrent delivery) and processing is skipped. Same
-- insert-before-process trick as messages.external_message_id, as its own
-- table. Internal only -- RLS enabled with zero policies, so only the
-- service-role client (bypasses RLS) can touch it, exactly like
-- chat_ip_rate_limits.
create table public.stripe_webhook_events (
  event_id text primary key,
  type text not null,
  received_at timestamptz not null default now()
);

alter table public.stripe_webhook_events enable row level security;
