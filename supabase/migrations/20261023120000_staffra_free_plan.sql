-- Staffra Free: a permanent, card-less plan with a monthly reply quota and no
-- WhatsApp. It never touches Stripe -- there is no Price, no Customer, no
-- subscription -- so nothing on Stripe's side opens its periods or resets its
-- quota. The two functions below do that job, and only for this plan: every
-- paid plan's period is owned by the Stripe webhook (src/lib/stripe/webhooks.ts),
-- and both functions refuse to touch a row that has a Stripe subscription or
-- any other plan_key.

alter table public.company_billing drop constraint company_billing_plan_key_check;
alter table public.company_billing add constraint company_billing_plan_key_check
  check (plan_key in (
    'free',
    'starter', 'starter_annual', 'starter_wpp', 'starter_annual_wpp',
    'intermediate', 'intermediate_annual', 'intermediate_wpp', 'intermediate_annual_wpp',
    'pro', 'pro_annual', 'pro_wpp', 'pro_annual_wpp',
    'enterprise'
  ));

-- Moves a company onto Staffra Free and opens its first one-month period.
-- Returns the new period's start, or null when nothing changed:
--   - already on an active Staffra Free -> null, so a repeated click can never
--     reset a spent quota back to zero;
--   - a live Stripe subscription on the row -> null; the caller has to go
--     through cancellation first (the checkout route refuses before calling).
-- stripe_customer_id is kept, so a later upgrade reuses the same Customer.
create function public.activate_free_plan(p_company_id uuid, p_reply_limit integer)
returns timestamptz
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_start timestamptz := date_trunc('second', now());
begin
  insert into public.company_billing as b (
    company_id, plan_key, subscription_status, stripe_subscription_id,
    current_period_start, current_period_end, cancel_at_period_end
  )
  values (p_company_id, 'free', 'active', null, v_start, v_start + interval '1 month', false)
  on conflict (company_id) do update
     set plan_key = 'free',
         subscription_status = 'active',
         stripe_subscription_id = null,
         current_period_start = excluded.current_period_start,
         current_period_end = excluded.current_period_end,
         cancel_at_period_end = false
   where not (b.plan_key = 'free' and b.subscription_status = 'active')
     and not (b.stripe_subscription_id is not null
              and b.subscription_status in ('active', 'trialing', 'past_due'));

  if not found then
    return null;
  end if;

  insert into public.company_message_usage (company_id, period_start, replies_used, reply_limit)
  values (p_company_id, v_start, 0, p_reply_limit)
  on conflict (company_id, period_start) do nothing;

  return v_start;
end;
$$;

-- The monthly reset for Staffra Free, run lazily by whoever needs the current
-- period (the reply gate, the billing page, the usage tracker) instead of by
-- a cron. Returns the current period's start, opening a new period first if
-- the stored one has ended; null for any company that isn't on an active
-- Staffra Free without a Stripe subscription -- those periods are Stripe's.
--
-- `for update` serialises concurrent callers on the billing row: the first
-- one rolls the period, the rest see the new end date and return it as is.
-- A company idle for several months jumps straight to the period containing
-- now(), counted in whole months from the stored start.
create function public.roll_free_plan_period(p_company_id uuid, p_reply_limit integer)
returns timestamptz
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_start timestamptz;
  v_end timestamptz;
  v_months integer := 1;
begin
  select current_period_start, current_period_end
    into v_start, v_end
    from public.company_billing
   where company_id = p_company_id
     and plan_key = 'free'
     and subscription_status = 'active'
     and stripe_subscription_id is null
   for update;

  if not found or v_start is null or v_end is null then
    return null;
  end if;
  if v_end > now() then
    return v_start;
  end if;

  while v_start + make_interval(months => v_months) <= now() loop
    v_months := v_months + 1;
  end loop;
  v_end := v_start + make_interval(months => v_months);
  v_start := v_start + make_interval(months => v_months - 1);

  update public.company_billing
     set current_period_start = v_start,
         current_period_end = v_end
   where company_id = p_company_id;

  insert into public.company_message_usage (company_id, period_start, replies_used, reply_limit)
  values (p_company_id, v_start, 0, p_reply_limit)
  on conflict (company_id, period_start) do nothing;

  return v_start;
end;
$$;

-- Service-role only, like record_ai_reply: Supabase grants EXECUTE to
-- anon/authenticated on every new function by default, which here would let a
-- merchant put themselves on a plan or reopen a period.
revoke execute on function public.activate_free_plan(uuid, integer) from public, anon, authenticated;
grant execute on function public.activate_free_plan(uuid, integer) to service_role;
revoke execute on function public.roll_free_plan_period(uuid, integer) from public, anon, authenticated;
grant execute on function public.roll_free_plan_period(uuid, integer) to service_role;
