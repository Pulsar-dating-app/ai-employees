-- Widens company_billing.plan_key's CHECK to accept the 8 new plan variants
-- added to src/lib/billing/plans.ts: an annual billing period and a
-- WhatsApp-included add-on for each self-serve tier (Starter/Intermediate/
-- Pro), independently combinable -- "<tier>_annual", "<tier>_wpp",
-- "<tier>_annual_wpp". The original 4 keys are untouched, so no data
-- migration is needed for existing rows. Same reasoning as the original
-- constraint's own comment (and the 20260914130000 "intermediate" migration
-- that followed it): a new plan variant is already a plans.ts + Stripe
-- change, and this CHECK only guards against a mistyped/unrecognised key
-- ever landing in this column (from the P3 checkout route or the P4
-- webhook's lookup_key resolution).
alter table public.company_billing drop constraint company_billing_plan_key_check;
alter table public.company_billing add constraint company_billing_plan_key_check
  check (plan_key in (
    'starter', 'starter_annual', 'starter_wpp', 'starter_annual_wpp',
    'intermediate', 'intermediate_annual', 'intermediate_wpp', 'intermediate_annual_wpp',
    'pro', 'pro_annual', 'pro_wpp', 'pro_annual_wpp',
    'enterprise'
  ));
