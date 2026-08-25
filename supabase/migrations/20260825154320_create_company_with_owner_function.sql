-- create_company_with_owner: atomically inserts a companies row and a
-- company_users row (role='owner') for the calling user. Exposed in `public`
-- (not `private`) so it can be called via PostgREST RPC from the A3 API
-- routes — the multi-table insert needs a single statement to be atomic,
-- which supabase-js's client-side calls can't otherwise guarantee.
--
-- security definer (like the private.is_company_* helpers): the companies
-- INSERT's RETURNING clause is itself subject to the table's SELECT policy
-- ("Company members can view their company" -> is_company_member(id)), and
-- at that point the caller isn't a member yet — the company_users row is
-- the next statement. security invoker hits that chicken-and-egg RLS
-- failure ("new row violates row-level security policy for table
-- companies"); security definer bypasses RLS for both statements, which is
-- safe here because the function takes no company_id/user_id input — the
-- owner is always auth.uid(), enforced by the explicit guard below.
create function public.create_company_with_owner(
  company_name varchar,
  company_email varchar,
  company_phone varchar,
  company_website_url varchar,
  company_description text,
  company_currency varchar,
  company_country varchar,
  company_timezone varchar
)
returns public.companies
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  new_company public.companies;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  insert into public.companies (name, email, phone, website_url, description, currency, country, timezone)
  values (company_name, company_email, company_phone, company_website_url, company_description, company_currency, company_country, company_timezone)
  returning * into new_company;

  insert into public.company_users (company_id, user_id, role)
  values (new_company.id, auth.uid(), 'owner');

  return new_company;
end;
$$;

-- Supabase's default-privileges rule for the public schema grants EXECUTE
-- directly to anon/authenticated/service_role on every new function (not
-- via a PUBLIC grant), so `... from public` alone won't reach anon here —
-- it has to be revoked explicitly.
revoke execute on function public.create_company_with_owner(varchar, varchar, varchar, varchar, text, varchar, varchar, varchar) from public, anon;
grant execute on function public.create_company_with_owner(varchar, varchar, varchar, varchar, text, varchar, varchar, varchar) to authenticated;
