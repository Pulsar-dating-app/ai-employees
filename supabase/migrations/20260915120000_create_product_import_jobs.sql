-- Bulk product import (Trello B4) went async on 2026-09-15: the insert now
-- runs in `after()`, after the response, so nothing about its outcome is
-- known at response time anymore. This table is what lets the merchant's
-- own browser tab -- reloaded, or reopened later -- ask "what happened to
-- my last import" instead of having no way to find out. One row per import
-- attempt, written only by the service-role client (the import route's
-- background work), read by company members for the progress bar / final
-- outcome.
--
-- inserted_count is updated as each chunk of the import commits -- the
-- source of the frontend's overall (not per-chunk) progress bar. On a
-- failed run every row that chunk progress represents is rolled back (see
-- the import route's own comment for why compensating delete, not a real
-- transaction), so inserted_count on a `failed` row is diagnostic history
-- only -- the frontend must treat `status = 'failed'` as zero imported,
-- never read inserted_count as "how many survived."
create table public.product_import_jobs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  status text not null default 'processing' check (status in ('processing', 'succeeded', 'failed')),
  total_rows integer not null check (total_rows > 0),
  inserted_count integer not null default 0 check (inserted_count >= 0),
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz default now()
);

-- The status endpoint always wants "this company's most recent job" --
-- covers exactly that lookup.
create index product_import_jobs_company_id_created_at_idx
  on public.product_import_jobs (company_id, created_at desc);

create trigger set_product_import_jobs_updated_at
before update on public.product_import_jobs
for each row execute function public.set_updated_at();

alter table public.product_import_jobs enable row level security;

-- Member-readable (for the progress bar / status poll), same bar as the
-- rest of the products routes. No write policy for regular clients --
-- only the import route's own service-role client ever writes this,
-- mirroring company_billing's shape.
create policy "Company members can view import jobs"
on public.product_import_jobs for select
using (private.is_company_member(company_id));

revoke insert, update, delete on public.product_import_jobs from authenticated, anon;
