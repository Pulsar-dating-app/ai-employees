-- Trello M1 follow-up -- private.slugify/generate_unique_company_slug were
-- created without an explicit search_path (caught by the security advisor,
-- same "Function Search Path Mutable" class this codebase already fixed
-- once for is_company_member/is_company_admin/handle_new_user, see
-- 20260823204229_harden_function_security). Fixed here rather than left for
-- later.
create or replace function private.slugify(input text)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select trim(both '-' from regexp_replace(lower(unaccent(trim(input))), '[^a-z0-9]+', '-', 'g'));
$$;

create or replace function private.generate_unique_company_slug(base_name text)
returns text
language plpgsql
set search_path = public, pg_temp
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
