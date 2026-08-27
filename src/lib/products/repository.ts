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
  is_active: boolean;
  created_at: string;
  updated_at: string | null;
};

export type ProductSearchParams = {
  companyId: string;
  text?: string;
  category?: string;
  priceMin?: number;
  priceMax?: number;
  attributes?: Record<string, unknown>;
  limit?: number;
};

const DEFAULT_LIMIT = 5;
const MAX_LIMIT = 20;
// How many company-scoped candidates to pull from Postgres before ranking by
// relevance in JS -- must be wider than any requested limit or there'd be
// nothing left to rank among. Plain `ilike`, per the card's explicit MVP
// allowance (a `to_tsvector` index is called out as an optional upgrade, not
// required now); a company with a catalog larger than this pool may miss a
// relevant match ranked past position 50, an accepted MVP tradeoff.
const CANDIDATE_POOL_SIZE = 50;

// PostgREST's `.or()` filter string uses commas to separate conditions, so a
// raw comma/parenthesis in user-supplied search text would otherwise corrupt
// or hijack the filter. Wrapping the value in double quotes (escaping any
// backslash/quote already inside it) is PostgREST's documented escape hatch
// for exactly this.
function escapeOrFilterValue(value: string): string {
  const escaped = value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return `"${escaped}"`;
}

function relevanceScore(product: Product, needle: string): number {
  let score = 0;
  if (product.name?.toLowerCase().includes(needle)) score += 2;
  if (product.description?.toLowerCase().includes(needle)) score += 1;
  return score;
}

// Array.prototype.sort is stable (guaranteed since ES2019), so products
// tied on score keep their incoming order (created_at desc) as a
// secondary sort -- no separate tie-breaker needed.
function rankByRelevance(products: Product[], text: string): Product[] {
  const needle = text.toLowerCase();
  return [...products].sort((a, b) => relevanceScore(b, needle) - relevanceScore(a, needle));
}

async function search(params: ProductSearchParams, supabaseClient?: SupabaseClient): Promise<Product[]> {
  const limit = Math.min(Math.max(params.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
  const serviceClient = supabaseClient ?? createServiceClient();

  let query = serviceClient
    .from("products")
    .select("*")
    .eq("company_id", params.companyId)
    .eq("is_active", true);

  if (params.category) query = query.eq("category", params.category);
  if (params.priceMin !== undefined) query = query.gte("price", params.priceMin);
  if (params.priceMax !== undefined) query = query.lte("price", params.priceMax);
  if (params.attributes) query = query.contains("attributes", params.attributes);

  const text = params.text?.trim();
  if (text) {
    const pattern = escapeOrFilterValue(`%${text}%`);
    query = query.or(`name.ilike.${pattern},description.ilike.${pattern}`);
  }

  const { data, error } = await query
    .order("created_at", { ascending: false })
    .limit(CANDIDATE_POOL_SIZE);

  if (error) throw error;
  const products = (data ?? []) as Product[];

  if (!text) return products.slice(0, limit);
  return rankByRelevance(products, text).slice(0, limit);
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
