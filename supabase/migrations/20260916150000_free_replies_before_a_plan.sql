-- Moves the paywall off the hire and onto the reply, so a merchant can walk
-- the whole first session -- create the company, hire, import a catalogue,
-- and watch her answer their own questions -- before being asked to pay.
-- Trello P6 made hiring the activation gate; this replaces that with a small
-- allowance metered at the only choke point every channel already calls
-- (evaluateReplyGate). See decisions.md.

alter table public.companies
  add column free_replies_used integer not null default 0;

comment on column public.companies.free_replies_used is
  'Replies this company has taken from the pre-plan allowance (FREE_REPLY_ALLOWANCE in src/lib/billing/limits.ts). Only ever incremented, by the service-role client in recordAiReply, and only while the company has no company_billing row. Per-company rather than per-account is safe today because company_users.user_id is unique -- one company per account; if that ever changes, this has to move to public.users alongside trial_used_at.';

-- Both of these decide whether replies are free, so neither may be writable by
-- the merchant. RLS on `companies` restricts by ROW, not by column, and the
-- table-wide grant from 20260825171500 lets an admin update any column of
-- their own company -- including through a direct PostgREST call that never
-- touches this app's routes. Without the revoke below, a merchant could clear
-- onboarding_completed_at (reopening the free window) or zero
-- free_replies_used (refilling it), indefinitely. Exactly the hole
-- 20260908110000 closed for users.trial_used_at.
revoke update on public.companies from authenticated, anon;
grant update (
  id, name, email, phone, website_url, description, shipping_policy,
  return_policy, payment_policy, faq, additional_information, currency,
  country, timezone, created_at, updated_at, industry,
  requires_appointment_approval, slug, allowed_embed_domains,
  allow_human_handoff, min_lead_time_minutes, cancellation_cutoff_hours,
  address
) on public.companies to authenticated, anon;

-- Every company that exists predates this flow and is already past it. Without
-- this they would all read as "still onboarding" -- i.e. never metered, never
-- blocked, free forever.
update public.companies
set onboarding_completed_at = coalesce(onboarding_completed_at, created_at)
where onboarding_completed_at is null;

-- The pre-plan counterpart to record_ai_reply. Same shape and the same
-- reasoning: one atomic writer, a row lock so concurrent replies serialise,
-- and no caller ever computes the next value itself. Increments only while
-- the company has no company_billing row -- once it does, record_ai_reply
-- owns the counting and this becomes a no-op rather than double-counting.
create function public.record_free_reply(p_company_id uuid)
returns integer
language sql
security definer
set search_path = public, pg_temp
as $$
  update public.companies c
     set free_replies_used = c.free_replies_used + 1
   where c.id = p_company_id
     and not exists (select 1 from public.company_billing b where b.company_id = c.id)
  returning c.free_replies_used;
$$;

-- Service-role only, same as record_ai_reply: Supabase grants EXECUTE on new
-- functions to anon/authenticated by default, which on this one would hand a
-- merchant the ability to burn their own allowance -- or, worse, sit next to
-- a column the whole point of this migration is to keep them out of.
revoke execute on function public.record_free_reply(uuid) from public, anon, authenticated;
grant execute on function public.record_free_reply(uuid) to service_role;
