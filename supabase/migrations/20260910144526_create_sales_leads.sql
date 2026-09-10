-- The public "Talk to a specialist" form on the landing page (a 3-step
-- quick-contact modal). One row per submission. Never exposed to any client
-- role -- RLS enabled with zero policies, so only the service-role client
-- (which bypasses RLS, used by /api/sales-contact) can write or read it,
-- the same "deny everyone but the one caller who needs it" shape used by
-- chat_ip_rate_limits and the *_connection credential tables. There is no
-- in-app surface to read leads yet; the team reads them straight from the
-- table.
create table public.sales_leads (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text not null,
  email text not null,
  whatsapp text not null,
  interests text[] not null default '{}',
  company_name text not null,
  message text not null,
  referral_source text,
  locale text,
  user_agent text,
  ip text,
  metadata jsonb not null default '{}'
);

create index sales_leads_created_at_idx on public.sales_leads(created_at desc);
create index sales_leads_ip_created_at_idx on public.sales_leads(ip, created_at);

alter table public.sales_leads enable row level security;
