-- Widens company_billing.plan_key's CHECK to accept the new "intermediate"
-- self-serve tier (src/lib/billing/plans.ts) sitting between Starter and
-- Pro. Same reasoning as the original constraint's own comment: a new plan
-- is already a plans.ts + Stripe change, and this CHECK is what guards
-- against a mistyped/unrecognised key ever landing in this column (from the
-- P3 checkout route or the P4 webhook's lookup_key resolution).
alter table public.company_billing drop constraint company_billing_plan_key_check;
alter table public.company_billing add constraint company_billing_plan_key_check
  check (plan_key in ('starter', 'intermediate', 'pro', 'enterprise'));
