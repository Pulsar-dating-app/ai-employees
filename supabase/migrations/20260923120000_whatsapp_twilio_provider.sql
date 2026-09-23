-- 2026-09-23 -- WhatsApp via Twilio (see decisions.md). Expand-only: the Meta
-- Cloud API columns stay until the cutover is confirmed, so a connection row
-- is either provider = 'meta' (existing columns) or provider = 'twilio'
-- (the columns added here).
--
-- Twilio maps ONE WhatsApp Business Account to ONE Twilio (sub)account, so
-- each company gets its own subaccount: `company_twilio_accounts` holds that
-- per-company credential (one row per company), while the per-agent WhatsApp
-- numbers ("senders") are rows of company_whatsapp_connections, exactly as
-- before.

create table public.company_twilio_accounts (
  company_id uuid primary key references public.companies(id) on delete cascade,
  subaccount_sid text not null unique,
  -- AES-256-GCM ciphertext (src/lib/whatsapp/twilio/crypto.ts) -- never the
  -- raw token. Needed both to call Twilio as the subaccount and to validate
  -- the X-Twilio-Signature of that subaccount's webhooks.
  auth_token_encrypted text not null,
  -- The WABA this subaccount is bound to (Twilio allows exactly one).
  waba_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger set_company_twilio_accounts_updated_at
before update on public.company_twilio_accounts
for each row execute function public.set_updated_at();

-- Service-role only: RLS on with no policy, and every grant revoked, so not
-- even a company admin can read the (encrypted) credential through the REST
-- API. Same posture as the WhatsApp connection writes locked down in
-- 20260922100000.
alter table public.company_twilio_accounts enable row level security;
revoke all on public.company_twilio_accounts from anon, authenticated;

-- Twilio rows have no Meta phone_number_id.
alter table public.company_whatsapp_connections
  alter column phone_number_id drop not null;

alter table public.company_whatsapp_connections
  add column provider text not null default 'meta'
    constraint company_whatsapp_connections_provider_check check (provider in ('meta', 'twilio')),
  add column twilio_sender_sid text,
  -- E.164, e.g. +5511999998888. The identity a Twilio inbound webhook's `To`
  -- resolves to, and the value the platform-wide one-number-one-agent rule is
  -- enforced on for Twilio rows.
  add column phone_e164 text,
  -- Raw Twilio sender status (CREATING, ONLINE, OFFLINE, ...) for the
  -- dashboard; `status` stays the coarse pending/connected/disconnected.
  add column sender_status text,
  add column quality_rating text,
  add column messaging_limit text,
  add column last_synced_at timestamptz;

alter table public.company_whatsapp_connections
  add constraint company_whatsapp_connections_provider_identity_check
  check (
    (provider = 'meta' and phone_number_id is not null)
    or (provider = 'twilio' and phone_e164 is not null)
  );

create unique index company_whatsapp_connections_phone_e164_idx
  on public.company_whatsapp_connections (phone_e164)
  where provider = 'twilio' and status <> 'disconnected';

create unique index company_whatsapp_connections_twilio_sender_sid_idx
  on public.company_whatsapp_connections (twilio_sender_sid)
  where twilio_sender_sid is not null;

-- Read-only for regular clients (writes are service-role only since
-- 20260922100000, so no insert/update grant here). The sender SID stays
-- server-side.
grant select (provider, phone_e164, sender_status, quality_rating, messaging_limit, last_synced_at)
on public.company_whatsapp_connections
to authenticated, anon;
