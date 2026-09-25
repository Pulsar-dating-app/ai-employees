create table public.company_twilio_accounts (
  company_id uuid primary key references public.companies(id) on delete cascade,
  account_sid text not null unique,
  auth_token text not null,
  created_at timestamptz not null default now()
);

alter table public.company_twilio_accounts enable row level security;

revoke all on public.company_twilio_accounts from authenticated, anon;

alter table public.company_whatsapp_connections
  add column provider text not null default 'meta' check (provider in ('meta', 'twilio')),
  add column twilio_sender_sid text,
  add column twilio_sender_id text,
  add column twilio_sender_status text;

create index company_whatsapp_connections_twilio_sender_id_idx
  on public.company_whatsapp_connections (twilio_sender_id)
  where twilio_sender_id is not null;

grant select (provider, twilio_sender_status)
on public.company_whatsapp_connections
to authenticated;
