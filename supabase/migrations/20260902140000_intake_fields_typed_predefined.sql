-- Trello R2 -- rework appointment_intake_fields from "a list of free-text
-- labels the AI fuzzy-matches" into a typed, stable-keyed model:
--
--   * key         -- immutable slug; intake_answers is now keyed by this,
--                    not by the editable label, so renaming a label never
--                    orphans stored answers.
--   * field_type  -- 'email' | 'name' | 'phone' | 'cpf' | 'date' | 'text'.
--                    Known types get light validation (repository) and,
--                    where a column exists (name/email/phone), get written
--                    onto the customers row too.
--   * is_enabled  -- lets a merchant turn a predefined field off without
--                    deleting it. Custom fields are always enabled
--                    (removing one = deleting the row, as before).
--
-- Every company gets a fixed predefined core set (email, full_name, phone,
-- cpf, date_of_birth), seeded by a trigger on company insert and backfilled
-- here for existing companies. `email` is always enabled and always
-- required and the PUT route refuses to change either -- there is no
-- booking without an email (decisions.md 2026-09-02).

alter table public.appointment_intake_fields
  add column key text,
  add column field_type text not null default 'text'
    check (field_type in ('email', 'name', 'phone', 'cpf', 'date', 'text')),
  add column is_enabled boolean not null default true;

-- Backfill: every existing row is a K8 custom (free-text) field. Give it a
-- slug from its label, deduped per company by appending -2, -3, ...
do $$
declare
  r record;
  base_slug text;
  candidate text;
  n int;
begin
  for r in select id, company_id, label from public.appointment_intake_fields order by company_id, position loop
    base_slug := regexp_replace(lower(btrim(r.label)), '[^a-z0-9]+', '_', 'g');
    base_slug := btrim(base_slug, '_');
    if base_slug = '' then base_slug := 'campo'; end if;
    base_slug := left(base_slug, 40);
    candidate := base_slug;
    n := 1;
    while exists (
      select 1 from public.appointment_intake_fields
      where company_id = r.company_id and key = candidate and id <> r.id
    ) loop
      n := n + 1;
      candidate := base_slug || '_' || n;
    end loop;
    update public.appointment_intake_fields set key = candidate where id = r.id;
  end loop;
end $$;

alter table public.appointment_intake_fields
  alter column key set not null,
  add constraint appointment_intake_fields_company_key_unique unique (company_id, key);

-- Seed the predefined core set for one company. Idempotent (on conflict do
-- nothing), so it's safe to call from the trigger and the backfill alike.
create or replace function private.seed_predefined_intake_fields(p_company_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.appointment_intake_fields
    (company_id, key, label, field_type, is_required, is_enabled, position)
  values
    (p_company_id, 'email',         'Email',                'email', true,  true,  -5),
    (p_company_id, 'full_name',     'Nome completo',        'name',  true,  true,  -4),
    (p_company_id, 'phone',         'Telefone',             'phone', false, false, -3),
    (p_company_id, 'cpf',           'CPF',                  'cpf',   false, false, -2),
    (p_company_id, 'date_of_birth', 'Data de nascimento',   'date',  false, false, -1)
  on conflict (company_id, key) do nothing;
$$;

-- Backfill existing companies. Negative positions keep the predefined set
-- above whatever custom rows a company already had (those start at 0).
select private.seed_predefined_intake_fields(id) from public.companies;

create or replace function private.on_company_created_seed_intake()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.seed_predefined_intake_fields(new.id);
  return new;
end $$;

create trigger seed_intake_fields_after_company_insert
after insert on public.companies
for each row execute function private.on_company_created_seed_intake();
