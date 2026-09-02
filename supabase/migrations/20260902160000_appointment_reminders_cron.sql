-- Trello R4 -- appointment reminder emails. The re-scoped, buildable
-- version of the parked J4 (proactive reminders were impossible on
-- Instagram/web chat; email is a channel we control).
--
-- Same split as N6 (20260902102416): all logic in a bearer-guarded Next.js
-- route (POST/GET /api/cron/appointment-reminders), this migration only
-- schedules the trigger. pg_cron + pg_net are already enabled by N6's
-- migration; this reuses them.
--
-- Scheduled only when both Vault secrets exist:
--   vault:  app_base_url    (already set for N6)
--   vault:  cron_secret     == the deploy's CRON_SECRET env var
-- Absent (local / CI) -> logged no-op, route still testable directly. In
-- production: set `cron_secret` in the Vault, then
--   select private.schedule_appointment_reminders();

-- reminder_sent_at: null until the cron has emailed a reminder for this
-- booking (or decided there's nothing to send). The route's idempotency
-- key -- it only ever looks at rows where this is null.
alter table public.appointments
  add column reminder_sent_at timestamptz;

create or replace function private.schedule_appointment_reminders()
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
    return 'skipped: set Vault secrets app_base_url and cron_secret, then re-run select private.schedule_appointment_reminders();';
  end if;

  -- Every hour at :07. The route sends for anything confirmed within the
  -- next 25h that hasn't had a reminder, so hourly is plenty and a missed
  -- run is caught by the next one.
  perform cron.schedule(
    'appointment-reminders',
    '7 * * * *',
    format(
      $cmd$select net.http_post(
        url := %L,
        headers := jsonb_build_object('Authorization', 'Bearer ' || %L, 'Content-Type', 'application/json'),
        body := '{}'::jsonb
      );$cmd$,
      rtrim(v_base_url, '/') || '/api/cron/appointment-reminders',
      v_secret
    )
  );

  return 'scheduled: appointment-reminders (hourly at :07)';
end $$;

do $$
begin
  raise notice 'R4: %', private.schedule_appointment_reminders();
end $$;
