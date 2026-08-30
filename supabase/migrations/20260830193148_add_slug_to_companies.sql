-- Trello M1 -- companies.slug powers the web chat channel's public URL
-- (/talk/{company-slug}/{agent-slug}, M4) instead of an ugly UUID.
-- Auto-suggested from the company name at creation (create_company_with_owner,
-- updated below) and backfilled here for every existing company, so the
-- whole system has slugs from day one, not just companies created after
-- this migration. Merchant-editing the slug itself is a future concern, not
-- part of M1 (schema-only).

create extension if not exists unaccent;

-- Lowercases, strips accents, replaces anything that isn't a-z/0-9 with a
-- single hyphen, trims leading/trailing hyphens. Deterministic given the
-- same input, so IMMUTABLE is correct.
create or replace function private.slugify(input text)
returns text
language sql
immutable
as $$
  select trim(both '-' from regexp_replace(lower(unaccent(trim(input))), '[^a-z0-9]+', '-', 'g'));
$$;

-- Appends -2, -3, ... to the slugified base until it doesn't collide with an
-- existing companies.slug. Used both by the one-time backfill below and by
-- create_company_with_owner for every future company.
create or replace function private.generate_unique_company_slug(base_name text)
returns text
language plpgsql
as $$
declare
  base text := private.slugify(base_name);
  candidate text;
  suffix int := 1;
begin
  if base = '' or base is null then
    base := 'company';
  end if;

  candidate := base;
  while exists (select 1 from public.companies where slug = candidate) loop
    suffix := suffix + 1;
    candidate := base || '-' || suffix;
  end loop;

  return candidate;
end;
$$;

alter table public.companies add column slug varchar;

-- One-time backfill, row by row -- each generated slug has to be visible to
-- the uniqueness check for the next row, which a single set-based UPDATE
-- can't guarantee.
do $$
declare
  r record;
begin
  for r in select id, name from public.companies where slug is null order by created_at loop
    update public.companies
    set slug = private.generate_unique_company_slug(r.name)
    where id = r.id;
  end loop;
end;
$$;

alter table public.companies
  alter column slug set not null,
  add constraint companies_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  add constraint companies_slug_unique unique (slug);

-- Every future company gets a slug automatically too, not just the backfill
-- above -- "auto-suggested from the company name" per the M1 plan.
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
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  insert into public.companies (name, slug, email, phone, website_url, description, currency, country, timezone)
  values (
    company_name,
    private.generate_unique_company_slug(company_name),
    company_email, company_phone, company_website_url, company_description, company_currency, company_country, company_timezone
  )
  returning * into new_company;

  insert into public.company_users (company_id, user_id, role)
  values (new_company.id, auth.uid(), 'owner');

  return new_company;
end;
$$;
