-- 2026-09-22 -- CRITICAL. The INSERT policy on company_users let any
-- authenticated user self-insert into ANY company with ANY role, including
-- 'owner':
--
--   with check (user_id = auth.uid() OR private.is_company_admin(company_id))
--
-- The `user_id = auth.uid()` branch never constrained `role` at all, and
-- the table has no default/CHECK/trigger on that column either. A user with
-- no existing membership (company_users_user_id_key enforces one company
-- per account, but only blocks a SECOND row -- not a first one aimed at
-- someone else's company) could call POST /rest/v1/company_users directly
-- with an arbitrary company_id and role: "owner", bypassing the Next.js app
-- entirely, and become the owner of that company -- full read/write access
-- to its customers, conversations, products, billing.
--
-- grep-verified this branch is dead code from the app's own perspective:
-- the only two INSERT sites are create_company_with_owner (SECURITY
-- DEFINER, bypasses RLS, always writes role='owner' for the caller's own
-- brand-new company -- unaffected by this change) and
-- /api/companies/[companyId]/members (admin-only, already goes through the
-- is_company_admin branch this migration keeps). No accept-invite or other
-- self-join feature exists in this codebase today.
drop policy "Users can join a company as themselves, admins can add members" on public.company_users;

create policy "Company admins can add members"
on public.company_users for insert
with check (private.is_company_admin(company_id));
