-- 2026-09-25 -- Managing the team's roles (see decisions.md "Owners/admins
-- promote; only the owner demotes or removes").
--   - an owner or admin can promote a member to admin;
--   - only the owner can demote an admin back to member, or remove anyone
--     from the company;
--   - the owner row itself is never changed or removed from a client.
-- The API enforces the same rules (members/[userId] route); these policies
-- make them hold for a direct PostgREST call too.
--
-- Plus: a record of each removal, so a removed person who logs in again is
-- told what happened instead of being dropped into "create your business".

-- ---------------------------------------------------------------------------
-- company_users
-- ---------------------------------------------------------------------------

drop policy "Company admins can add members" on public.company_users;
create policy "Company admins can add members"
on public.company_users for insert
with check (
  private.is_company_owner(company_id)
  or (private.is_company_admin(company_id) and role <> 'owner')
);

-- An admin can only touch a member's row, and only to leave it a member or
-- make it an admin (a promotion). Demoting an admin is the owner's call.
drop policy "Company admins can update membership" on public.company_users;
create policy "Admins promote members; the owner manages every other role"
on public.company_users for update
using (
  (private.is_company_owner(company_id) and role <> 'owner')
  or (private.is_company_admin(company_id) and role = 'member')
)
with check (
  (private.is_company_owner(company_id) and role <> 'owner')
  or (private.is_company_admin(company_id) and role in ('member', 'admin'))
);

drop policy "Company admins can remove membership" on public.company_users;
create policy "Only the owner removes people from the company"
on public.company_users for delete
using (private.is_company_owner(company_id) and role <> 'owner');

-- ---------------------------------------------------------------------------
-- Removal notices
-- ---------------------------------------------------------------------------

-- One row per removal. company_name is a snapshot: the notice still reads
-- right if the company is later renamed or deleted. acknowledged_at is set
-- when the person moves on (creates their own business from the notice).
create table public.company_member_removals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  company_id uuid references public.companies(id) on delete set null,
  company_name text not null,
  removed_by uuid references auth.users(id) on delete set null,
  removed_at timestamptz not null default now(),
  acknowledged_at timestamptz
);

create index company_member_removals_user_id_idx on public.company_member_removals (user_id, removed_at desc);
create index company_member_removals_company_id_idx on public.company_member_removals (company_id);
create index company_member_removals_removed_by_idx on public.company_member_removals (removed_by);

-- The removed person reads their own notices; written only by the
-- service-role client (the removal route and the acknowledge action).
alter table public.company_member_removals enable row level security;

create policy "Users can view their own removal notices"
on public.company_member_removals for select
using (user_id = (select auth.uid()));

revoke insert, update, delete on public.company_member_removals from authenticated, anon;
