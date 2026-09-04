-- Trello D5: periodically re-check WABA payment eligibility for connections
-- currently flagged has_payment_issue, so a merchant who fixes their
-- payment method in Meta Business Manager gets unblocked without needing to
-- disconnect/reconnect. Same scheduler-agnostic design as N6's
-- instagram-token-refresh cron (decisions.md 2026-09-02): all the logic
-- lives in POST/GET /api/cron/whatsapp/recheck-eligibility, guarded by a
-- bearer CRON_SECRET; this migration only pulls the trigger via pg_cron +
-- pg_net, and only when both Vault secrets exist. Locally/CI those secrets
-- are absent, so this is a clean no-op and the integration suite exercises
-- the route directly.
--
-- Caveat carried from the route itself: the opportunistic path (D4's send
-- call reporting error 131042) is the reliable signal. This recheck can
-- only prove the WABA is reachable, not that every payment gotcha (tax
-- info, wrong currency/timezone) is actually resolved -- Meta has no single
-- confirmed "billing eligibility" field to poll (see decisions.md, D5's
-- original research note). Treat this cron as best-effort, not a
-- source of truth on its own.
--
-- The job is only scheduled when BOTH Vault secrets exist:
--   vault:  app_base_url                            e.g. https://app.staffra.io
--   vault:  whatsapp_eligibility_recheck_cron_secret == the deploy's CRON_SECRET env var
-- In production, set the two secrets in the Vault, then re-run:
--
--   select private.schedule_whatsapp_eligibility_recheck();

do $$
begin
  create extension if not exists pg_cron;
exception when others then
  raise notice 'D5: pg_cron unavailable (%), skipping the WhatsApp eligibility-recheck schedule. The /api/cron/whatsapp/recheck-eligibility route is unaffected.', sqlerrm;
end $$;

do $$
begin
  create extension if not exists pg_net with schema extensions;
exception when others then
  raise notice 'D5: pg_net unavailable (%), skipping the WhatsApp eligibility-recheck schedule.', sqlerrm;
end $$;

create or replace function private.schedule_whatsapp_eligibility_recheck()
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
  from vault.decrypted_secrets where name = 'whatsapp_eligibility_recheck_cron_secret';

  if v_base_url is null or v_secret is null then
    return 'skipped: set Vault secrets app_base_url and whatsapp_eligibility_recheck_cron_secret, then re-run select private.schedule_whatsapp_eligibility_recheck();';
  end if;

  -- 03:37 UTC daily -- off the hour and off N6's :11, arbitrary otherwise.
  -- Self-healing: a missed run just means the flag clears a day later.
  perform cron.schedule(
    'whatsapp-eligibility-recheck',
    '37 3 * * *',
    format(
      $cmd$select net.http_post(
        url := %L,
        headers := jsonb_build_object('Authorization', 'Bearer ' || %L, 'Content-Type', 'application/json'),
        body := '{}'::jsonb
      );$cmd$,
      rtrim(v_base_url, '/') || '/api/cron/whatsapp/recheck-eligibility',
      v_secret
    )
  );

  return 'scheduled: whatsapp-eligibility-recheck (daily 03:37 UTC)';
end $$;

do $$
begin
  raise notice 'D5: %', private.schedule_whatsapp_eligibility_recheck();
end $$;
