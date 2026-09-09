-- One company per account, enforced for real. Until now this was only a UI
-- convention (the onboarding page is "the one company-creation path", and
-- the dashboard shell assumes `companies[0]` is *the* company) -- nothing at
-- the DB or API layer actually stopped a second membership for the same
-- user: `create_company_with_owner` only checks `auth.uid() is not null`,
-- and `POST /api/companies/[id]/members` had no check against the invitee
-- already belonging elsewhere. The prior `unique(company_id, user_id)` only
-- ruled out re-adding the same person to the *same* company twice.
--
-- This constraint makes the whole system's "one company per account"
-- assumption a real guarantee: a user can hold at most one row in
-- `company_users`, whether they created it (POST /api/companies /
-- create_company_with_owner) or were invited into it (POST
-- /api/companies/[id]/members). Both call sites already surface a
-- unique_violation (23505) as a clean 409 -- the members route already did,
-- and the plain create route now does too.
alter table public.company_users
  add constraint company_users_user_id_key unique (user_id);
