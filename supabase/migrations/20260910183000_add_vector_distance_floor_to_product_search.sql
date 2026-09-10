-- Adds a distance floor to hybrid search's semantic leg.
--
-- The 2026-08-29 embeddings migration left `vector_top` as a plain top-50
-- nearest-neighbour pool with NO "too far to count" cutoff, and its own
-- decisions.md entry named the exact condition for revisiting that: "If
-- hand-testing turns up a case where an irrelevant product actually gets
-- recommended (not just present in a tool result the model correctly
-- ignores), that's the concrete failure to tune a threshold against."
--
-- That case showed up. On a real merchant catalog ("Jorginho e CIA",
-- mostly Shopify-synced snowboards with NULL embeddings + a handful of
-- BRL fashion items that DO have embeddings), a customer asking Malu for
-- "óculos para neve" got Óculos de Sol Retrô (fine) plus Tênis Esportivo
-- Runner and Bolsa de Couro Sintético (not fine) -- the last two have no
-- lexical overlap with the query at all and surfaced purely through the
-- vector leg. With only ~6 embedded products in that company, "top 50
-- nearest" is "every embedded product", so every one of them entered the
-- fused result with a non-zero RRF score and the model recited them.
--
-- The floor: a row only joins the semantic leg when its cosine distance to
-- the query embedding is <= p_max_vector_distance (default 0.55). The
-- lexical leg is untouched -- a genuine keyword/category match still
-- surfaces a row however far its embedding lands, so this can only ever
-- remove vector-only noise, never a row the old lexical path already found.
--
-- Why 0.55, and why a parameter: measured against that catalog's real
-- text-embedding-3-small vectors, product<->product cosine distance runs
-- ~0.33 for a genuinely tight pair (floral tee <-> summer dress) and
-- ~0.60-0.70 for cross-domain pairs (sunglasses <-> running shoes was
-- 0.641, sunglasses <-> bag 0.599) -- exactly the false positives above.
-- 0.55 sits below that noise band and above the tight-pair distance. It is
-- deliberately a parameter, not a baked constant, because this is one
-- catalog's distribution and a query->document distance is not the same as
-- a document<->document one: ProductRepository passes MAX_VECTOR_DISTANCE
-- (src/lib/products/repository.ts) and a caller can override per call while
-- the value is tuned against more real data. See decisions.md.
--
-- Signature change (a new parameter), so drop-and-recreate, not CREATE OR
-- REPLACE -- same reasoning as every prior rev of this function.
-- supabase-js calls by parameter name, so p_max_vector_distance's position
-- doesn't matter to any existing caller.
drop function if exists public.search_products(uuid, text[], varchar, numeric, numeric, vector, integer);

create function public.search_products(
  p_company_id uuid,
  p_keywords text[] default null,
  p_category varchar default null,
  p_price_min numeric default null,
  p_price_max numeric default null,
  p_query_embedding vector(1536) default null,
  p_max_vector_distance numeric default 0.55,
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
  -- Semantic leg: nearest neighbours by cosine distance, now with a floor.
  -- p_max_vector_distance keeps a genuinely unrelated row (large distance)
  -- out of the fused set entirely rather than letting it ride in on a low
  -- RRF score -- see this migration's header for how the default was picked.
  -- A null p_max_vector_distance disables the floor (back to plain top-50).
  vector_top as (
    select b.id, b.embedding <=> p_query_embedding as distance
    from base b
    where p_query_embedding is not null
      and b.embedding is not null
      and (p_max_vector_distance is null
           or (b.embedding <=> p_query_embedding) <= p_max_vector_distance)
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

revoke execute on function public.search_products(uuid, text[], varchar, numeric, numeric, vector, numeric, integer) from public, anon, authenticated;
