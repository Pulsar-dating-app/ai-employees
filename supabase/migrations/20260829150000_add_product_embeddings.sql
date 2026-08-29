-- Hybrid product search: adds a semantic (embedding) leg alongside the
-- existing lexical (search_vector) one. Real bug that motivated this: a
-- merchant asked Malu for "roupa" when the catalog's category is
-- "Vestimentas" -- to_tsvector('portuguese', ...) treats 'roup' and
-- 'vestiment' as unrelated lexemes, so no amount of tokenizing/relaxing the
-- lexical side (2026-08-29's earlier fix in this same log) can ever close
-- that gap. Embeddings compare meaning, not lexemes, and close it natively.
--
-- `embedding` is NOT a generated column like search_vector -- computing it
-- requires an external OpenAI call, which a generated column's expression
-- (pure, deterministic, DB-side only) cannot make. It's a plain nullable
-- column populated by application code (src/lib/products/embeddings.ts) on
-- every product write; a null value means "not embedded yet" and that row
-- simply falls back to lexical-only ranking in the hybrid function below --
-- never an error, never a reason to block a write. See decisions.md for why
-- write-time generation was chosen over a backfill-only job (staleness).
--
-- HNSW (not IVFFlat): IVFFlat's `lists` parameter has to be tuned to roughly
-- sqrt(row count) at build time and re-tuned as the table grows, or recall
-- degrades silently. HNSW needs no such tuning and stays accurate as the
-- catalog grows -- worth the build cost, negligible at this scale (dozens to
-- low thousands of products per company).
create extension if not exists vector;

-- 1536 = text-embedding-3-small's output size (src/lib/products/embeddings.ts).
-- Changing the embedding model later means a new migration to widen this
-- column and a full re-embed -- vectors from two different models are not
-- comparable.
alter table public.products add column embedding vector(1536);

create index products_embedding_idx on public.products
  using hnsw (embedding vector_cosine_ops);

-- Signature change (a new parameter), so this must be dropped and re-added
-- rather than CREATE OR REPLACE'd -- same reasoning as the generated-column
-- rewrite earlier in this file's own migration series. supabase-js's
-- .rpc(name, { ...namedArgs }) calls by parameter NAME, not position, so
-- p_query_embedding's position in the list doesn't matter to any existing
-- caller.
drop function if exists public.search_products(uuid, text[], varchar, numeric, numeric, jsonb, integer);

-- search_products: hybrid ranked product search -- fuses lexical
-- (search_vector, unchanged from the previous version) and semantic
-- (embedding) matches via Reciprocal Rank Fusion (RRF).
--
-- Why RRF, not a weighted sum: ts_rank's scale (roughly 0-1, but unbounded
-- upward with many keyword matches) and cosine distance's scale (0-2) are
-- not comparable, so summing them raw would give one leg arbitrary,
-- uncalibrated dominance over the other. RRF instead uses only each leg's
-- *rank position* -- score = 1/(60+rank_fulltext) + 1/(60+rank_vector), each
-- term 0 when a row is absent from that leg -- so a row ranked well by
-- either method rises, and a row ranked well by both rises further, with no
-- scale-calibration problem. The constant 60 is the standard RRF choice from
-- the original paper (Cormack et al.) and Postgres hybrid-search references
-- (e.g. Supabase's, Weaviate's) -- it discounts rank differences deep in the
-- list without needing catalog-specific tuning.
--
-- SECURITY: unchanged from the previous version -- company_id is a plain
-- parameter with no membership check of its own, safe only when called with
-- a trusted company_id (never a customer-supplied one). EXECUTE stays
-- revoked from anon/authenticated below.
create function public.search_products(
  p_company_id uuid,
  p_keywords text[] default null,
  p_category varchar default null,
  p_price_min numeric default null,
  p_price_max numeric default null,
  p_attributes jsonb default null,
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
  variants jsonb,
  attributes jsonb,
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
  -- Every non-text filter (tenant, active, category, price, attributes)
  -- applies once here and is shared by both search legs below, so a product
  -- excluded by a filter can never re-enter through the other leg.
  base as (
    select p.*
    from public.products p
    where p.company_id = p_company_id
      and p.is_active = true
      and (p_category is null or p.category = p_category)
      and (p_price_min is null or p.price >= p_price_min)
      and (p_price_max is null or p.price <= p_price_max)
      and (p_attributes is null or p.attributes @> p_attributes)
  ),
  -- Lexical leg: identical matching to the previous version (OR across
  -- keywords, AND within one keyword's own words, trigram as a tie-break
  -- nudge only -- see this migration series' earlier comments for why).
  -- Capped to a top-50 candidate pool before ranking: RRF only needs each
  -- leg's relative order, not its full result set.
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
  -- Semantic leg: nearest neighbours by cosine distance. Only rows with a
  -- real embedding participate -- a product not yet embedded (write races,
  -- generation failures) simply carries no semantic signal instead of
  -- erroring, and still competes on the lexical leg above.
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
    b.image_url, b.product_url, b.category, b.variants, b.attributes, b.metadata,
    b.stock, b.is_active, b.created_at, b.updated_at
  from base b
  left join fused fz on fz.id = b.id
  where
    -- No search signal at all (neither keywords nor a query embedding) --
    -- default browse order, unchanged from every previous version.
    (not exists (select 1 from keyword_list) and p_query_embedding is null)
    -- Otherwise a row must have actually matched on at least one leg.
    or fz.id is not null
  order by
    case when exists (select 1 from keyword_list) or p_query_embedding is not null
      then fz.score end desc nulls last,
    b.created_at desc
  limit greatest(p_limit, 1);
$$;

revoke execute on function public.search_products(uuid, text[], varchar, numeric, numeric, jsonb, vector, integer) from public, anon, authenticated;
