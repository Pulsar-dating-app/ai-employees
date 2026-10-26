-- Companies default to BRL and Brazil. Neither column had a default, and
-- create_company_with_owner passed the caller's NULLs straight through, so
-- every company made in onboarding started without a currency or country and
-- Settings asked for both. Brazil is the primary market.

alter table public.companies alter column currency set default 'BRL';
alter table public.companies alter column country set default 'BR';

update public.companies set currency = 'BRL' where currency is null;
update public.companies set country = 'BR' where country is null;

-- Same body as 20260925120000, with currency and country coalesced.
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
        company_email, company_phone, company_website_url, company_description,
        coalesce(company_currency, 'BRL'), coalesce(company_country, 'BR'),
        coalesce(company_timezone, 'America/Sao_Paulo')
      )
      returning * into new_company;
      exit;
    exception when unique_violation then
      if attempt = max_attempts then
        raise;
      end if;
    end;
  end loop;

  insert into public.company_users (company_id, user_id, role)
  values (new_company.id, auth.uid(), 'owner');

  update public.professionals
  set user_id = auth.uid()
  where company_id = new_company.id and user_id is null;

  return new_company;
end;
$$;
