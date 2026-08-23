-- products: a company's catalog, imported from CSV/XLSX or future ecommerce integrations
create table public.products (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  external_id varchar,
  sku varchar,
  name varchar,
  description text,
  price decimal(12,2),
  currency varchar(3),
  image_url text,
  product_url text,
  category varchar,
  variants jsonb,
  attributes jsonb,
  metadata jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz default now()
);

create index products_company_id_idx on public.products(company_id);
create index products_category_idx on public.products(category);
create index products_is_active_idx on public.products(is_active);

create trigger set_products_updated_at
before update on public.products
for each row execute function public.set_updated_at();

alter table public.products enable row level security;

create policy "Company members can view products"
on public.products for select
using (public.is_company_member(company_id));

create policy "Company members can create products"
on public.products for insert
with check (public.is_company_member(company_id));

create policy "Company members can update products"
on public.products for update
using (public.is_company_member(company_id));

create policy "Company members can delete products"
on public.products for delete
using (public.is_company_member(company_id));
