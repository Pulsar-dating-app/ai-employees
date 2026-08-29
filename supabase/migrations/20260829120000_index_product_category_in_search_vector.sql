-- Real bug found manually testing Malu: a customer asked for "camisa de
-- time", then "camisa de futebol", and got "we don't have that" both times
-- -- but "camisa do corinthians" found the shirt immediately. Two
-- independent causes; this migration fixes one of them (the other is the
-- keyword-splitting fallback in ProductRepository.search).
--
-- Cause fixed here: `search_vector` indexed only name and description, so
-- `products.category` -- real, merchant-curated, structured data -- never
-- participated in keyword search at all. The shirt in question is
-- categorised "Futebol", and the word "futebol" appears nowhere in its name
-- or description, so no amount of better keyword handling could ever have
-- matched it on that word. Verified against the real catalog before writing
-- this: websearch_to_tsquery('portuguese', 'futebol') matched nothing.
--
-- The `category` filter param (search_products' p_category) does not cover
-- this: it demands an exact, case-sensitive value the model is explicitly
-- told never to guess (see the tool's own schema description), so a customer
-- naming a category in ordinary language had no path to it.
--
-- Weighted 'C' (below name 'A' and description 'B'): a product whose *name*
-- matches must still outrank one that merely shares a category, otherwise a
-- broad category word would flatten the ranking of every item under it.
--
-- A generated column can't be altered in place, so this drops and re-adds
-- it; the GIN index goes with the column and is recreated. Cheap at this
-- catalog size, and there is nothing to backfill -- a stored generated
-- column is recomputed for every row on creation.

drop index if exists products_search_vector_idx;

alter table public.products drop column search_vector;

alter table public.products
  add column search_vector tsvector
  generated always as (
    setweight(to_tsvector('portuguese', coalesce(name, '')), 'A') ||
    setweight(to_tsvector('portuguese', coalesce(description, '')), 'B') ||
    setweight(to_tsvector('portuguese', coalesce(category, '')), 'C')
  ) stored;

create index products_search_vector_idx on public.products using gin (search_vector);
