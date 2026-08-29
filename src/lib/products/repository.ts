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
// Hard ceiling regardless of what the caller (the search_products agent
// tool, driven by an LLM) requests -- found by hand-testing: the
// system_prompt's anti-overwhelm rule (2026-08-27, see decisions.md) only
// named "the full list"/"all products" as the trigger to avoid, so a
// request like "todos os calçados e camisetas" (a scoped-but-still-broad
// multi-category ask, not literally "everything") slipped past it and
// still got a large dump. Prompt wording can always miss a phrasing that
// wasn't named -- this cap is a deterministic backstop that holds
// regardless of wording, lowered from 20 (per user request, after seeing
// this gap) since even 20 items in one reply is more than a real
// salesperson would recite at once.
const MAX_LIMIT = 10;

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
async function runSearchRpc(
  params: ProductSearchParams,
  keywords: string[],
  limit: number,
  serviceClient: SupabaseClient,
): Promise<Product[]> {
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

// Every word inside one keyword is ANDed together (websearch_to_tsquery's
// space-is-AND syntax), which is what stops "camiseta azul" from matching
// every camiseta in the catalog. The cost is that a single word the catalog
// simply doesn't use makes the whole keyword match nothing: "camisa de time"
// becomes 'camis' & 'tim', and finds no football shirt even though "camisa"
// on its own would have found it.
//
// This relaxation drops exactly those dead words and keeps every surviving
// word ANDed. It is deliberately NOT a widening to OR-of-words: that would
// answer "camiseta azul masculina" with a "Calça Azul", matching on one
// unrelated word -- precisely the irrelevance this search was rewritten to
// eliminate (see the migration's own comments). A word the catalog has never
// heard of carries no information, so removing it loses no precision;
// everything the catalog does know stays required together.
async function withUnmatchableWordsDropped(
  params: ProductSearchParams,
  keywords: string[],
  serviceClient: SupabaseClient,
): Promise<string[]> {
  const words = [
    ...new Set(
      keywords
        .flatMap((keyword) => keyword.split(/\s+/))
        .map((word) => word.trim())
        // Single characters carry no signal and only widen the net.
        .filter((word) => word.length > 1),
    ),
  ];
  if (words.length === 0) return [];

  // One probe per distinct word, in parallel, reusing the same
  // category/price filters so a word that only matches outside them doesn't
  // count as known. Bounded and cheap: a handful of limit-1 queries, run
  // only on a path whose alternative is telling the customer the store has
  // nothing.
  const probes = await Promise.all(words.map((word) => runSearchRpc(params, [word], 1, serviceClient)));
  const known = new Set(words.filter((_, index) => probes[index].length > 0));
  if (known.size === 0) return [];

  return [
    ...new Set(
      keywords
        .map((keyword) =>
          keyword
            .split(/\s+/)
            .filter((word) => known.has(word))
            .join(" "),
        )
        .filter(Boolean),
    ),
  ];
}

async function search(params: ProductSearchParams, supabaseClient?: SupabaseClient): Promise<Product[]> {
  const limit = Math.min(Math.max(params.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
  const serviceClient = supabaseClient ?? createServiceClient();

  const keywords = [...(params.keywords ?? []), ...(params.text ? [params.text] : [])]
    .map((keyword) => keyword.trim())
    .filter(Boolean);

  const strict = await runSearchRpc(params, keywords, limit, serviceClient);
  if (strict.length > 0 || keywords.length === 0) return strict;

  // Found by hand-testing: "camisa de time" and "camisa de futebol" both
  // returned nothing while "camisa do corinthians" found the shirt at once.
  // The tool description asks the model for short single-concept terms, but
  // a model can always phrase one some way that wasn't anticipated -- this
  // is the deterministic backstop for that, in the same spirit as MAX_LIMIT.
  // Runs only when the strict pass found nothing, so it can never dilute a
  // search that was already working.
  const relaxed = await withUnmatchableWordsDropped(params, keywords, serviceClient);
  const unchanged = relaxed.length === keywords.length && relaxed.every((k, i) => k === keywords[i]);
  if (relaxed.length === 0 || unchanged) return strict;

  return runSearchRpc(params, relaxed, limit, serviceClient);
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
