// Every place a product row is returned to a client -- a JSON API response
// or a Server Component prop serialized into the RSC payload -- must select
// this explicit column list instead of "*". Two columns exist purely for
// server-side search internals and must never leave the server:
// `search_vector` (tsvector, migration 20260827180000) and `embedding`
// (vector(1536), migration 20260829150000) -- the latter alone is ~1536
// floats per row, so a plain "*" on a list endpoint or a bulk import
// response would balloon payload size for zero benefit (the browser has no
// use for either column), and `embedding` values landing in an Agent Engine
// tool result would additionally feed grounding.ts's number-collection walk
// as spurious price/stock-shaped digits.
// A single unbroken literal, not built via string concatenation -- kept
// this way (not wrapped/split) so supabase-js's select-query-parser can
// still infer it as a literal type and give real per-column typing instead
// of falling back to GenericStringError, which concatenated literals don't
// reliably preserve through a module boundary.
export const PRODUCT_PUBLIC_COLUMNS =
  "id, company_id, external_id, sku, name, description, price, currency, image_url, product_url, category, metadata, stock, is_active, created_at, updated_at";
