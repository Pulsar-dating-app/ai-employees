create or replace function public.product_categories(p_company_id uuid)
returns table (category text)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select distinct p.category::text
  from public.products p
  where p.company_id = p_company_id
    and p.is_active
    and p.category is not null
    and btrim(p.category) <> ''
  order by 1;
$$;

revoke execute on function public.product_categories(uuid) from public, anon;
grant execute on function public.product_categories(uuid) to authenticated;
