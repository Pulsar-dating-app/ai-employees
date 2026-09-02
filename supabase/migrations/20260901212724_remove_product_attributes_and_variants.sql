-- Removes products.variants and products.attributes entirely. Both were
-- freeform jsonb with no fixed shape per merchant/product type (a t-shirt's
-- size/color, a cake's weight, a service's duration don't share one schema),
-- and in practice they were dead weight: never fed into the embedding or
-- lexical search text (buildProductEmbeddingInput only ever used
-- name/category/description), and search_products never exposed attribute
-- filtering to the AI tool despite the SQL-level p_attributes plumbing
-- existing. Merchants were filling in structure that went nowhere. See
-- decisions.md for the full reasoning and the chosen alternative (lean on
-- `description`, invest in in-product education instead of a rigid or
-- per-industry structured schema).

alter table public.products
  drop column variants,
  drop column attributes;

-- Signature/return-shape change -- must be dropped and re-created, same
-- reasoning as the embeddings migration's own p_query_embedding addition
-- (CREATE OR REPLACE can't change a function's return column list).
drop function if exists public.search_products(uuid, text[], varchar, numeric, numeric, jsonb, vector, integer);

create function public.search_products(
  p_company_id uuid,
  p_keywords text[] default null,
  p_category varchar default null,
  p_price_min numeric default null,
  p_price_max numeric default null,
  p_query_embedding vector(1536) default null,
  p_limit integer default 5
)
returns table (
  id uuid,
  company_id uuid,
  external_id varchar,
  sku varchar,
  name varchar,
  description text,
  price decimal(12,2),
  currency varchar,
  image_url text,
  product_url text,
  category varchar,
  metadata jsonb,
  stock integer,
  is_active boolean,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
stable
set search_path = public, pg_temp
as $$
  with keyword_list as (
    select trim(kw) as kw
    from unnest(coalesce(p_keywords, array[]::text[])) as kw
    where trim(kw) <> ''
  ),
  base as (
    select p.*
    from public.products p
    where p.company_id = p_company_id
      and p.is_active = true
      and (p_category is null or p.category = p_category)
      and (p_price_min is null or p.price >= p_price_min)
      and (p_price_max is null or p.price <= p_price_max)
  ),
  fulltext_top as (
    select b.id,
      (
        select coalesce(sum(
          ts_rank(b.search_vector, websearch_to_tsquery('portuguese', k.kw))
          + greatest(
              similarity(coalesce(b.name, ''), k.kw),
              similarity(coalesce(b.description, ''), k.kw)
            ) * 0.1
        ), 0)
        from keyword_list k
      ) as relevance
    from base b
    where exists (select 1 from keyword_list)
      and exists (
        select 1 from keyword_list k
        where b.search_vector @@ websearch_to_tsquery('portuguese', k.kw)
      )
    order by relevance desc
    limit 50
  ),
  fulltext_ranked as (
    select id, row_number() over (order by relevance desc) as rnk
    from fulltext_top
  ),
  vector_top as (
    select b.id, b.embedding <=> p_query_embedding as distance
    from base b
    where p_query_embedding is not null
      and b.embedding is not null
    order by distance asc
    limit 50
  ),
  vector_ranked as (
    select id, row_number() over (order by distance asc) as rnk
    from vector_top
  ),
  fused as (
    select
      coalesce(f.id, v.id) as id,
      coalesce(1.0 / (60 + f.rnk), 0) + coalesce(1.0 / (60 + v.rnk), 0) as score
    from fulltext_ranked f
    full outer join vector_ranked v on v.id = f.id
  )
  select
    b.id, b.company_id, b.external_id, b.sku, b.name, b.description, b.price, b.currency,
    b.image_url, b.product_url, b.category, b.metadata,
    b.stock, b.is_active, b.created_at, b.updated_at
  from base b
  left join fused fz on fz.id = b.id
  where
    (not exists (select 1 from keyword_list) and p_query_embedding is null)
    or fz.id is not null
  order by
    case when exists (select 1 from keyword_list) or p_query_embedding is not null
      then fz.score end desc nulls last,
    b.created_at desc
  limit greatest(p_limit, 1);
$$;

revoke execute on function public.search_products(uuid, text[], varchar, numeric, numeric, vector, integer) from public, anon, authenticated;
