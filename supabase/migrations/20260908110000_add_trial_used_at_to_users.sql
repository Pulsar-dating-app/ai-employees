-- Trello P8 -- the Starter free trial (15 days, reduced quota) is eligible
-- once per account, not once per company (see decisions.md 2026-09-08 "one
-- company per account" + this card). This column is that record: set once,
-- the first time an account's checkout gets a trialing subscription.
alter table public.users add column trial_used_at timestamptz;

-- Column-level lockdown, same shape as company_whatsapp_connections.access_token
-- (migration 20260826104820): the table-wide grant from
-- 20260825171500_grant_default_table_privileges.sql lets an authenticated
-- user update any column of their own row (RLS's "Users can update own
-- profile" only restricts by row, not by column) -- without this, a user
-- could self-clear trial_used_at via a direct Supabase call and re-trial
-- indefinitely. Revoke the table-wide update grant and re-grant it back
-- naming every existing column except trial_used_at; only a service-role
-- client (the checkout route + the Stripe webhook) can write it.
revoke update on public.users from authenticated, anon;

grant update (
  id, email, name, created_at, updated_at
) on public.users to authenticated, anon;
