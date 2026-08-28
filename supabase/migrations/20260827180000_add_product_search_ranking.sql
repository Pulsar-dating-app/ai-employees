-- Real bug found manually testing Malu (see 2026-08-27 decisions.md
-- entries): search_products' text search matched the whole query as one
-- literal phrase, so a real product was invisible to any search whose
-- words didn't appear adjacent, in that order, in name/description. A
-- quick fix (tokenized ILIKE, every word required somewhere in
-- name/description) already shipped in application code. This migration is
-- the next step, already flagged as the sanctioned upgrade in
-- ProductRepository's own file comment: real Postgres full-text search
-- instead of ILIKE.
--
-- Paired with an application-level change (ProductRepository.search) that
-- now also accepts multiple `keywords` -- the search_products agent tool
-- asks the model for 2-5 related terms (synonyms/alternate phrasings, not
-- just the customer's literal words) in the SAME tool-call turn it was
-- already making, so there's no extra LLM round trip. A product matches if
-- it matches ANY keyword (OR across keywords), each keyword's own words are
-- still required together (AND within one keyword, via websearch_to_tsquery's
-- space-is-AND syntax) -- this is why plain PostgREST filter syntax
-- (.textSearch()/.or()) isn't enough here: a single SQL function is what
-- lets full-text rank, an OR-across-keywords match, and one ORDER BY all
-- happen in one request.

-- Trigram similarity (typo/near-miss tolerance) -- used only as a ranking
-- tie-breaker below, NOT as a match qualifier (see the function body
-- comment for why: applying similarity() to a whole multi-word phrase is
-- lenient enough to false-positive-match on a shared prefix alone, e.g.
-- "Camiseta Branca" scoring deceptively close to a "camiseta azul" query).
create extension if not exists pg_trgm;

-- 'portuguese' because this catalog is majority-Brazil merchants (see
-- product decisions in this log) -- Postgres's Snowball stemmer for any
-- config still indexes non-Portuguese words as literal tokens (it doesn't
-- reject anything it can't stem), so English/mixed-language catalogs still
-- get indexed, just without Portuguese-specific plural/gender stemming.
-- setweight('A' for name, 'B' for description) is what makes a name match
-- outrank a description-only match in ts_rank -- without it, a term found
-- in either field would score identically.
alter table public.products
  add column search_vector tsvector
  generated always as (
    setweight(to_tsvector('portuguese', coalesce(name, '')), 'A') ||
    setweight(to_tsvector('portuguese', coalesce(description, '')), 'B')
  ) stored;

create index products_search_vector_idx on public.products using gin (search_vector);
create index products_name_trgm_idx on public.products using gin (name gin_trgm_ops);

-- search_products: ranked, multi-keyword product search.
--
-- SECURITY: takes company_id as a plain parameter with no membership check
-- of its own -- exactly like every other query in ProductRepository (see
-- that file's own comment), it is only safe to call with a trusted
-- company_id. EXECUTE is revoked from anon/authenticated below for exactly
-- this reason: this function must only ever be reachable via the
-- service-role client, never directly by a regular user (who could
-- otherwise pass an arbitrary company_id and read another company's
-- catalog -- there's no RLS check inside a plain SQL function).
create function public.search_products(
  p_company_id uuid,
  p_keywords text[] default null,
  p_category varchar default null,
  p_price_min numeric default null,
  p_price_max numeric default null,
  p_attributes jsonb default null,
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
  scored as (
    select
      p.*,
      -- Relevance = sum, across keywords, of that keyword's full-text rank
      -- (the real signal, weighted by the name/description setweight
      -- above) plus a small trigram-similarity nudge (*0.1 -- deliberately
      -- small: this must never be able to outweigh a real rank difference,
      -- it only breaks near-ties in favor of a closer string match).
      -- Trigram is NOT part of the match/qualify condition below --
      -- similarity() on a whole multi-word keyword is lenient enough to
      -- match on a shared prefix alone (e.g. "Camiseta Branca" vs a
      -- "camiseta azul" query share enough trigrams from "camiseta " to
      -- pass a naive threshold), which would silently reintroduce
      -- irrelevant results -- exactly what this whole change exists to
      -- prevent. If a future iteration wants real typo tolerance in the
      -- qualify condition, it needs to go per-word, not per-keyword-phrase.
      (
        select coalesce(sum(
          ts_rank(p.search_vector, websearch_to_tsquery('portuguese', k.kw))
          + greatest(
              similarity(coalesce(p.name, ''), k.kw),
              similarity(coalesce(p.description, ''), k.kw)
            ) * 0.1
        ), 0)
        from keyword_list k
      ) as relevance
    from public.products p
    where p.company_id = p_company_id
      and p.is_active = true
      and (p_category is null or p.category = p_category)
      and (p_price_min is null or p.price >= p_price_min)
      and (p_price_max is null or p.price <= p_price_max)
      and (p_attributes is null or p.attributes @> p_attributes)
      and (
        not exists (select 1 from keyword_list)
        or exists (
          select 1 from keyword_list k
          where p.search_vector @@ websearch_to_tsquery('portuguese', k.kw)
        )
      )
  )
  select
    id, company_id, external_id, sku, name, description, price, currency,
    image_url, product_url, category, variants, attributes, metadata,
    stock, is_active, created_at, updated_at
  from scored
  order by
    case when exists (select 1 from keyword_list) then relevance end desc nulls last,
    created_at desc
  limit greatest(p_limit, 1);
$$;

revoke execute on function public.search_products(uuid, text[], varchar, numeric, numeric, jsonb, integer) from public, anon, authenticated;
