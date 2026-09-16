-- The first session's last two steps are "watch her work" and "choose a
-- plan", in that order and never the other way round: the ask lands at the
-- moment she has just answered the merchant with their own data. This records
-- that the proof actually happened, so the flow can move on from it without
-- either skipping it or trapping the merchant on it forever.
--
-- Separate from onboarding_completed_at: one says "they saw her work", the
-- other says "they left the flow". A merchant who sees the proof and closes
-- the tab has the first and not the second, and comes back to the plan step.
alter table public.companies
  add column proof_seen_at timestamptz;

comment on column public.companies.proof_seen_at is
  'When the merchant first got a reply in the first session''s proof step (src/app/onboarding/ready). Set once by the preview-chat route, service-role only. Moves the flow to its plan step; never cleared.';

-- Same reasoning as onboarding_completed_at and free_replies_used: RLS on
-- `companies` restricts rows, not columns, so without this a merchant could
-- set it through a direct PostgREST call and skip the proof straight to the
-- plan step -- or clear it and sit on a step they already passed. Re-granting
-- names every column except the three the flow and the billing gate read.
revoke update on public.companies from authenticated, anon;
grant update (
  id, name, email, phone, website_url, description, shipping_policy,
  return_policy, payment_policy, faq, additional_information, currency,
  country, timezone, created_at, updated_at, industry,
  requires_appointment_approval, slug, allowed_embed_domains,
  allow_human_handoff, min_lead_time_minutes, cancellation_cutoff_hours,
  address
) on public.companies to authenticated, anon;

-- Every existing company is past this flow (they were backfilled as complete
-- in 20260916140000); stamping it keeps the two columns consistent.
update public.companies
set proof_seen_at = coalesce(proof_seen_at, onboarding_completed_at)
where proof_seen_at is null and onboarding_completed_at is not null;
