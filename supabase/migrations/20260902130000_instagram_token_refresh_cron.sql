-- Trello N6: keep Instagram long-lived tokens alive.
--
-- Instagram long-lived tokens expire after 60 days. Unlike WhatsApp's
-- (D1 records token_expires_at and renews nothing -- see the 2026-08-26
-- "WhatsApp token expiry is recorded, not auto-renewed" decision), an
-- Instagram token CAN be refreshed before it lapses, and here renewal is
-- not optional: a silently dead connection is an employee who stops
-- answering DMs, with no error the merchant can see.
--
-- This is the first scheduled-job infrastructure in the codebase (both
-- prior token-refresh decisions, 2026-08-26, explicitly deferred it as
-- "a real infra decision"). The design, per decisions.md 2026-09-02:
--
--   * All the logic lives in a plain Next.js route,
--     POST/GET /api/cron/instagram/refresh-tokens, guarded by a bearer
--     CRON_SECRET. It is scheduler-agnostic on purpose.
--   * This migration only pulls the trigger: pg_cron fires once a day and
--     pg_net POSTs to that route. Nothing here renews a token.
--   * Switching to Vercel Cron (or any other scheduler) later is a
--     ~10-line change -- unschedule here, add a vercel.json crons entry
--     pointing at the same path. The route does not change.
--
-- The job is only scheduled when BOTH Vault secrets exist:
--   vault:  app_base_url                        e.g. https://app.staffra.io
--   vault:  instagram_token_refresh_cron_secret  == the deploy's CRON_SECRET env var
-- Locally and in CI those secrets are absent, so `supabase db reset` runs
-- this migration to a clean no-op (a NOTICE, no cron job) and the
-- integration suite exercises the route directly instead. In production,
-- set the two secrets in the Vault, then re-run the scheduling block below
-- (Supabase SQL editor / MCP) -- no new migration needed:
--
--   select private.schedule_instagram_token_refresh();

-- pg_cron / pg_net may not be preloaded in every environment. Never let
-- their absence fail the whole migration (which would take the entire
-- integration suite down with it) -- the route still works when triggered
-- by any external scheduler.
do $$
begin
  create extension if not exists pg_cron;
exception when others then
  raise notice 'N6: pg_cron unavailable (%), skipping the Instagram token-refresh schedule. The /api/cron/instagram/refresh-tokens route is unaffected.', sqlerrm;
end $$;

do $$
begin
  create extension if not exists pg_net with schema extensions;
exception when others then
  raise notice 'N6: pg_net unavailable (%), skipping the Instagram token-refresh schedule.', sqlerrm;
end $$;

-- (Re)schedules the daily job from whatever the Vault currently holds.
-- Idempotent: cron.schedule upserts by job name, so calling this again
-- after rotating the secret just rewrites the command. A safe no-op when
-- pg_cron/pg_net/Vault aren't present or the secrets aren't set.
create or replace function private.schedule_instagram_token_refresh()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_base_url text;
  v_secret text;
begin
  -- pg_extension, not to_regproc('cron.schedule'): cron.schedule is
  -- overloaded (2-arg and 3-arg forms), which makes to_regproc return NULL
  -- even when the extension is installed.
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
  from vault.decrypted_secrets where name = 'instagram_token_refresh_cron_secret';

  if v_base_url is null or v_secret is null then
    return 'skipped: set Vault secrets app_base_url and instagram_token_refresh_cron_secret, then re-run select private.schedule_instagram_token_refresh();';
  end if;

  -- 03:11 UTC daily. The exact minute is arbitrary; off the hour to avoid
  -- the top-of-hour thundering herd. The route refreshes anything expiring
  -- within 7 days, so a missed run is self-healing -- the next day's run
  -- still catches every token in that window. Frequency and precision
  -- therefore barely matter.
  perform cron.schedule(
    'instagram-token-refresh',
    '11 3 * * *',
    format(
      $cmd$select net.http_post(
        url := %L,
        headers := jsonb_build_object('Authorization', 'Bearer ' || %L, 'Content-Type', 'application/json'),
        body := '{}'::jsonb
      );$cmd$,
      rtrim(v_base_url, '/') || '/api/cron/instagram/refresh-tokens',
      v_secret
    )
  );

  return 'scheduled: instagram-token-refresh (daily 03:11 UTC)';
end $$;

do $$
begin
  raise notice 'N6: %', private.schedule_instagram_token_refresh();
end $$;
