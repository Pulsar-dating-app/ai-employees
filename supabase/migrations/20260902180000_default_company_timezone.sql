-- companies.timezone was nullable with no default and no create-time UI, so
-- every company sat at NULL. That was harmless until the scheduling epic
-- (J) made it load-bearing: AppointmentRepository and the Agent Engine read
-- it to render slot/appointment times, and a NULL falls back to "UTC" --
-- so Ana literally told customers their options were "horário UTC" (found
-- in production 2026-09-02 wiring up the first real Instagram booking).
--
-- Fix: a Brazil-first default (the product's market -- BRL, pt-BR, no DST
-- anywhere in the zone since 2019), backfill the existing NULLs, and make
-- the create RPC honour the default when the caller passes NULL (onboarding
-- always does today; the API route does unless a body value is supplied).
-- Merchants outside Brasília time change it in Settings > Business info.

alter table public.companies
  alter column timezone set default 'America/Sao_Paulo';

update public.companies
  set timezone = 'America/Sao_Paulo'
  where timezone is null;

-- Same body as 20260831120000_retry_company_slug_on_collision.sql, with the
-- one change: an explicit NULL company_timezone now resolves to the column
-- default instead of being inserted as NULL (a plain INSERT column value
-- overrides the DEFAULT, so the coalesce has to be here).
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
        company_email, company_phone, company_website_url, company_description, company_currency, company_country,
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

  return new_company;
end;
$$;
