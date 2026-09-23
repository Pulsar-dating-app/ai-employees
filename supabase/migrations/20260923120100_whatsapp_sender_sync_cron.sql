-- 2026-09-23 -- Periodically syncs Twilio WhatsApp sender status. A sender is
-- registered asynchronously (CREATING -> ONLINE, minutes to hours while Meta
-- reviews the display name), and Twilio does not push sender-status changes
-- to the message webhooks -- so this poll is how a `pending` connection
-- flips to `connected` when the merchant isn't looking at the dashboard, and
-- how a sender that later goes OFFLINE is noticed.
--
-- Same scheduler-agnostic shape as the Instagram token refresh and the
-- (now superseded) D5 eligibility recheck: all logic lives in
-- GET/POST /api/cron/whatsapp/sync-senders, guarded by a bearer CRON_SECRET;
-- this migration only pulls the trigger via pg_cron + pg_net, and only when
-- both Vault secrets exist. Locally/CI those are absent, so this is a clean
-- no-op and the integration suite exercises the route directly.
--
--   vault:  app_base_url                            e.g. https://app.staffra.io
--   vault:  whatsapp_sender_sync_cron_secret == the deploy's CRON_SECRET env var
-- In production, set the two secrets in the Vault, then re-run:
--
--   select private.schedule_whatsapp_sender_sync();

do $$
begin
  create extension if not exists pg_cron;
exception when others then
  raise notice 'pg_cron unavailable (%), skipping the WhatsApp sender-sync schedule.', sqlerrm;
end $$;

do $$
begin
  create extension if not exists pg_net with schema extensions;
exception when others then
  raise notice 'pg_net unavailable (%), skipping the WhatsApp sender-sync schedule.', sqlerrm;
end $$;

create or replace function private.schedule_whatsapp_sender_sync()
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

  select decrypted_secret into v_base_url
  from vault.decrypted_secrets where name = 'app_base_url';
  select decrypted_secret into v_secret
  from vault.decrypted_secrets where name = 'whatsapp_sender_sync_cron_secret';

  if v_base_url is null or v_secret is null then
    return 'skipped: set Vault secrets app_base_url and whatsapp_sender_sync_cron_secret, then re-run select private.schedule_whatsapp_sender_sync();';
  end if;

  -- Every 15 minutes: a merchant waiting on Meta's review shouldn't wait
  -- longer than that for the "connected" state to show up.
  perform cron.schedule(
    'whatsapp-sender-sync',
    '*/15 * * * *',
    format(
      $cmd$select net.http_post(
        url := %L,
        headers := jsonb_build_object('Authorization', 'Bearer ' || %L, 'Content-Type', 'application/json'),
        body := '{}'::jsonb
      );$cmd$,
      rtrim(v_base_url, '/') || '/api/cron/whatsapp/sync-senders',
      v_secret
    )
  );

  return 'scheduled: whatsapp-sender-sync (every 15 minutes)';
end $$;

do $$
begin
  raise notice 'WhatsApp sender sync: %', private.schedule_whatsapp_sender_sync();
end $$;
