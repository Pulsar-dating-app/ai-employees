-- private.is_company_owner: mirrors is_company_member/is_company_admin, but
-- specifically for the 'owner' role. Needed to let an admin manage
-- non-owner membership rows while blocking them from touching (deleting,
-- updating, or promoting someone into) the owner role -- only the owner
-- themselves can do that.
create function private.is_company_owner(target_company_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.company_users cu
    where cu.company_id = target_company_id
      and cu.user_id = auth.uid()
      and cu.role = 'owner'
  );
$$;

-- Previously any admin could delete/update ANY company_users row, including
-- the owner's -- an admin could remove the owner outright, or (via UPDATE,
-- which had no with_check at all) promote anyone to owner. Both are now
-- restricted to the current owner.
drop policy "Company admins can remove membership" on public.company_users;
create policy "Company admins can remove membership"
on public.company_users for delete
using (
  private.is_company_admin(company_id)
  and (role <> 'owner' or private.is_company_owner(company_id))
);

drop policy "Company admins can update membership" on public.company_users;
create policy "Company admins can update membership"
on public.company_users for update
using (
  private.is_company_admin(company_id)
  and (role <> 'owner' or private.is_company_owner(company_id))
)
with check (
  private.is_company_admin(company_id)
  and (role <> 'owner' or private.is_company_owner(company_id))
);
