import { createServiceClient } from "@/lib/supabase/service";
import type { SupabaseClient } from "@supabase/supabase-js";

// Trello ticket B5 -- the ProductRepository abstraction from spec §12. Its
// real caller is the Agent Engine's (C1) search_products/get_product tools,
// invoked mid-turn while Malu is answering an inbound WhatsApp message --
// there is no authenticated merchant Supabase session in that context
// (customers aren't in auth.users), so the regular RLS-scoped client
// (src/lib/supabase/server.ts) simply doesn't work here, unlike B3's
// merchant-facing CRUD routes. This is why every query below goes through
// the service-role client and filters company_id/is_active explicitly in
// application code instead of relying on RLS -- any future caller of this
// module must always pass a trusted companyId, never one taken from an
// unauthenticated party.
//
// An optional `supabaseClient` param lets a caller inject its own client
// (defaulting to createServiceClient() when omitted) -- the Agent Engine's
// tool wrappers pass through the same client the rest of a run() call is
// using (deps.supabase), which is what lets an integration test point the
// whole pipeline at a local test Supabase instance instead of whatever
// createServiceClient() would resolve to from process.env.

export type Product = {
  id: string;
  company_id: string;
  external_id: string | null;
  sku: string | null;
  name: string;
  description: string | null;
  // Postgres numeric columns come back from PostgREST as strings to avoid
  // float precision loss -- matches B3's route/tests (see products.test.ts).
  price: string | null;
  currency: string | null;
  image_url: string | null;
  product_url: string | null;
  category: string | null;
  variants: unknown;
  attributes: Record<string, unknown> | null;
  metadata: unknown;
  // Nullable/unconstrained at the DB level (Trello B4) -- null means "not
  // tracked," 0 means "out of stock." Was missing from this type even
  // though `select("*")` always returned it -- fixed while rewriting
  // search() below, since search_products' explicit column list needed to
  // decide this deliberately rather than by omission.
  stock: number | null;
  is_active: boolean;
  created_at: string;
  updated_at: string | null;
};

export type ProductSearchParams = {
  companyId: string;
  // Single free-text phrase (e.g. a merchant-facing search box, or a caller
  // that only has one term) -- its words are ANDed together (via
  // websearch_to_tsquery's space-is-AND syntax), same as one entry in
  // `keywords` below.
  text?: string;
  // Multiple independent search terms -- a product matches if it matches
  // ANY of them (OR across keywords), ranked by how well it matched
  // overall. This is what the search_products agent tool uses: the model
  // is asked for a few related terms (the customer's literal words plus
  // reasonable synonyms/alternate phrasings), not just one phrase -- see
  // that tool's schema description and the 2026-08-27 decisions.md entry.
  // `text` and `keywords` are simply merged into one list before hitting
  // the DB; both are equally "a keyword," `text` just predates `keywords`
  // as this module's original single-term param.
  keywords?: string[];
  category?: string;
  priceMin?: number;
  priceMax?: number;
  attributes?: Record<string, unknown>;
  limit?: number;
};

const DEFAULT_LIMIT = 5;
const MAX_LIMIT = 20;

// Ranking, full-text matching, and trigram tie-breaking all happen in
// Postgres now (see migration 20260827180000_add_product_search_ranking and
// that migration's own function-body comments for why a plain SQL function
// was necessary instead of PostgREST's .textSearch()/.or() filter DSL:
// combining full-text rank + trigram + an OR-across-keywords match with one
// ORDER BY isn't expressible through it). This replaced an earlier
// application-side ILIKE + JS-side ranking implementation that required
// pulling a wide unranked candidate pool and sorting it in JS -- the DB now
// does exact ranking with its own ORDER BY + LIMIT, no candidate pool
// needed.
async function search(params: ProductSearchParams, supabaseClient?: SupabaseClient): Promise<Product[]> {
  const limit = Math.min(Math.max(params.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
  const serviceClient = supabaseClient ?? createServiceClient();

  const keywords = [...(params.keywords ?? []), ...(params.text ? [params.text] : [])]
    .map((keyword) => keyword.trim())
    .filter(Boolean);

  const { data, error } = await serviceClient.rpc("search_products", {
    p_company_id: params.companyId,
    p_keywords: keywords.length > 0 ? keywords : null,
    p_category: params.category ?? null,
    p_price_min: params.priceMin ?? null,
    p_price_max: params.priceMax ?? null,
    p_attributes: params.attributes ?? null,
    p_limit: limit,
  });

  if (error) throw error;
  return (data ?? []) as Product[];
}

// is_active is always enforced here too (not just in search) -- a
// soft-deleted product must never be recommendable to a customer, even by
// direct id, e.g. if it was mentioned earlier in the conversation and the
// merchant has since delisted it.
async function get(
  companyId: string,
  productId: string,
  supabaseClient?: SupabaseClient,
): Promise<Product | null> {
  const serviceClient = supabaseClient ?? createServiceClient();
  const { data, error } = await serviceClient
    .from("products")
    .select("*")
    .eq("id", productId)
    .eq("company_id", companyId)
    .eq("is_active", true)
    .maybeSingle();

  if (error) throw error;
  return (data as Product | null) ?? null;
}

export const ProductRepository = { search, get };
