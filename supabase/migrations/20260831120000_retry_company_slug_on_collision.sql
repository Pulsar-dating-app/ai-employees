-- Fixes a race in create_company_with_owner (M1): two companies created
-- concurrently with the same name both got the same slug and the loser 500'd.
--
-- private.generate_unique_company_slug picks a candidate with
-- `while exists (select 1 from public.companies where slug = candidate)` --
-- a check-then-insert, which is not atomic. Under concurrency both callers
-- see the candidate free, both insert, and the second one trips
-- companies_slug_unique; the RPC raises and /api/companies returns a 500 to
-- a merchant whose only mistake was picking a business name someone else
-- was typing at the same moment.
--
-- Found by the integration suite, where seven test files create a company
-- called "Auth Check Co" in parallel workers: it surfaced as a moving,
-- load-dependent failure (whichever file lost that particular race), which
-- is exactly how this would present in production.
--
-- The fix is to retry rather than to lock: after the winner commits, its row
-- is visible to the loser's next call and the candidate advances to -2. A
-- bounded loop keeps a pathological case from spinning; the final attempt
-- re-raises so a genuine constraint problem still surfaces instead of being
-- swallowed.
create or replace function public.create_company_with_owner(
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
  max_attempts constant int := 5;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  for attempt in 1..max_attempts loop
    begin
      insert into public.companies (name, slug, email, phone, website_url, description, currency, country, timezone)
      values (
        company_name,
        private.generate_unique_company_slug(company_name),
        company_email, company_phone, company_website_url, company_description, company_currency, company_country, company_timezone
      )
      returning * into new_company;
      exit;
    exception when unique_violation then
      -- Another transaction took this slug between our check and our insert.
      -- Re-generating now sees their committed row and moves on to -2, -3, ...
      if attempt = max_attempts then
        raise;
      end if;
    end;
  end loop;

  insert into public.company_users (company_id, user_id, role)
  values (new_company.id, auth.uid(), 'owner');

  return new_company;
end;
$$;
