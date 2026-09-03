-- A per-company "catch-all" service. A merchant who registers one broad
-- offering ("Avaliação") instead of one row per procedure can turn this on:
-- Ana then books any request that plausibly fits the business but doesn't
-- match a registered service under it, recording what the customer actually
-- asked for in the appointment summary. Seeded inactive; the merchant
-- activates it (is_active) and can rename it / set its duration like any
-- other service. It never appears in the normal service list or as a
-- pickable option -- list_services returns it separately as `defaultService`.
alter table public.services add column is_default boolean not null default false;

-- At most one default per company.
create unique index services_one_default_per_company
  on public.services (company_id) where is_default;

create index services_is_default_idx on public.services (company_id) where is_default;

-- Seed one inactive default service for a company. Idempotent, so it's safe
-- from the trigger and the backfill alike. Mirrors
-- private.seed_predefined_intake_fields.
create or replace function private.seed_default_service(p_company_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.services where company_id = p_company_id and is_default
  ) then
    insert into public.services
      (company_id, name, duration_minutes, buffer_minutes, is_active, is_default)
    values
      (p_company_id, 'Serviço padrão', 30, 0, false, true);
  end if;
end $$;

create or replace function private.on_company_created_seed_default_service()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.seed_default_service(new.id);
  return new;
end $$;

create trigger seed_default_service_after_company_insert
after insert on public.companies
for each row execute function private.on_company_created_seed_default_service();

select private.seed_default_service(id) from public.companies;
