-- Lets the Shopify catalogue sync upsert by (company_id, external_id)
-- instead of blindly inserting (which is all the CSV/XLSX import and the
-- CRUD routes do today, so a re-sync would duplicate every product).
--
-- NOT partial. A partial unique index (`where external_id is not null`)
-- cannot be named by PostgREST's `on_conflict=` param -- Postgres requires
-- the index predicate to be repeated in the ON CONFLICT clause, which
-- supabase-js's `.upsert({ onConflict })` can't express (42P10). A plain
-- composite unique index is fine here: Postgres treats a row with a NULL
-- in any indexed column as distinct, so the many CSV/manually-created rows
-- that leave external_id NULL never collide -- only two non-null
-- (company_id, external_id) pairs do, which is exactly the upsert key.
--
-- No change to the products columns or the search_products function.
create unique index products_company_external_id_idx
  on public.products (company_id, external_id);
