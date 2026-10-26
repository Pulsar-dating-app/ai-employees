-- Merchant nudges (2026-10-26): the one-off e-mails that bring back a
-- merchant who signed up and stopped -- mid-onboarding, or finished but never
-- put their hire in front of a customer. Of the first 22 ad sign-ups none
-- got a real conversation, and almost none signed in again.
--
-- One row per company and kind, written by the cron route
-- (/api/cron/merchant-nudges) after a send. The primary key is the
-- idempotency guarantee: a kind is sent to a company at most once, however
-- often the cron runs. Service role only.
create table public.merchant_nudges (
  company_id uuid not null references public.companies (id) on delete cascade,
  kind text not null check (kind in ('onboarding_stalled', 'not_live')),
  sent_at timestamptz not null default now(),
  primary key (company_id, kind)
);

alter table public.merchant_nudges enable row level security;
revoke all on public.merchant_nudges from authenticated, anon;

-- Same split as the reminder cron (20260902160000): all logic in the
-- bearer-guarded route, this only schedules it, and only once both Vault
-- secrets exist. The route itself also does nothing unless the deploy sets
-- MERCHANT_NUDGES_ENABLED=true, so scheduling it never e-mails anyone by
-- itself. In production: set the env var, then
--   select private.schedule_merchant_nudges();
create or replace function private.schedule_merchant_nudges()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_base_url text;
  v_secret text;
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron')
     or not exists (select 1 from pg_extension where extname = 'pg_net') then
    return 'skipped: pg_cron / pg_net not installed';
  end if;

  if to_regclass('vault.decrypted_secrets') is null then
    return 'skipped: Vault not available';
  end if;

  select decrypted_secret into v_base_url from vault.decrypted_secrets where name = 'app_base_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'cron_secret';

  if v_base_url is null or v_secret is null then
    return 'skipped: set Vault secrets app_base_url and cron_secret, then re-run select private.schedule_merchant_nudges();';
  end if;

  -- Hourly at :17. A nudge goes out within the hour of becoming due, at a
  -- time of day that follows the sign-up, and a missed run is caught by the
  -- next one.
  perform cron.schedule(
    'merchant-nudges',
    '17 * * * *',
    format(
      $cmd$select net.http_post(
        url := %L,
        headers := jsonb_build_object('Authorization', 'Bearer ' || %L, 'Content-Type', 'application/json'),
        body := '{}'::jsonb
      );$cmd$,
      rtrim(v_base_url, '/') || '/api/cron/merchant-nudges',
      v_secret
    )
  );

  return 'scheduled: merchant-nudges (hourly at :17)';
end $$;

-- Only the database owner (an operator in the SQL editor) schedules it.
revoke execute on function private.schedule_merchant_nudges() from public, anon, authenticated;

-- Deliberately not called here: unlike the reminders, this sends to
-- merchants, so turning it on is an explicit production step.
