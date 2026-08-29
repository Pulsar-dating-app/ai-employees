import { describe, expect, it, vi } from "vitest";
import { ProductRepository } from "@/lib/products/repository";
import { api } from "./helpers/request";
import { signUpTestUser } from "./helpers/auth";
import { getTestServiceClient } from "./helpers/service-client";
import type OpenAI from "openai";

// Hybrid product search (pgvector) -- imports ProductRepository.search()
// directly, the same justified deviation from "always over real HTTP" that
// tests/integration/agent-engine.test.ts uses: no route accepts a raw
// 1536-float query embedding as customer input, so there is nothing to hit
// over HTTP for this specific behavior. product-search.test.ts (the HTTP
// route) stays exactly as it was, covering the lexical-only path any caller
// without an openaiClient gets.
//
// Real Postgres runs the actual search_products RPC and its RRF fusion.
// OpenAI itself is faked (fixed, hand-built vectors) -- no real embedding
// call happens here; DISABLE_PRODUCT_EMBEDDINGS (global-setup.ts) already
// keeps every product created via the real HTTP route unembedded, so the
// vector these tests care about is always written directly by the test
// itself, deliberately, rather than depending on a real API call.

const EMBEDDING_DIMENSIONS = 1536;

// A small, distinct basis vector per "concept" -- not meant to resemble a
// real OpenAI embedding, just to be trivially distinguishable by cosine
// distance: index 0 close to 1 for concept "sports", index 1 for
// "kitchenware", zero elsewhere. Real embeddings are dense and
// high-dimensional; a sparse fake is enough to prove the RANKING mechanism
// (RRF fusion, cosine distance, the SQL itself) without needing anything
// resembling real semantic content.
function fakeVector(concept: "sports" | "kitchenware"): number[] {
  const v = new Array(EMBEDDING_DIMENSIONS).fill(0);
  v[concept === "sports" ? 0 : 1] = 1;
  return v;
}

function fakeOpenAiReturning(vector: number[]): OpenAI {
  return {
    embeddings: { create: vi.fn().mockResolvedValue({ data: [{ embedding: vector }] }) },
  } as unknown as OpenAI;
}

async function seedCompanyWithProduct(
  ownerCookie: string,
  companyName: string,
  productBody: Record<string, unknown>,
) {
  const created = await api<{ company: { id: string } }>("POST", "/api/companies", ownerCookie, {
    name: companyName,
  });
  const companyId = created.json.company.id;

  const product = await api<{ product: { id: string } }>(
    "POST",
    `/api/companies/${companyId}/products`,
    ownerCookie,
    productBody,
  );

  return { companyId, productId: product.json.product.id };
}

describe("hybrid product search (pgvector)", () => {
  // The case that motivated this whole migration series: a term the catalog
  // never uses at all lexically, but that means the same thing as the
  // product's real category. websearch_to_tsquery('portuguese', 'futebol')
  // matches nothing here on purpose -- "Esporte", not "Futebol" -- so a pass
  // is only possible through the vector leg.
  it("finds a product via the semantic leg alone, when the lexical leg has nothing to go on", async () => {
    const owner = await signUpTestUser("owner");
    const { companyId, productId } = await seedCompanyWithProduct(owner.cookieHeader, "Hybrid Sports Co", {
      name: "Camisa Corinthians",
      category: "Esporte",
    });

    const supabase = getTestServiceClient();
    const { error } = await supabase.from("products").update({ embedding: fakeVector("sports") }).eq("id", productId);
    if (error) throw error;

    const results = await ProductRepository.search(
      { companyId, keywords: ["time"] },
      supabase,
      fakeOpenAiReturning(fakeVector("sports")),
    );

    expect(results.map((p) => p.id)).toContain(productId);
  });

  // Without an openaiClient, search() must behave exactly as it did before
  // this feature existed -- lexical-only, embedding column untouched.
  it("without an openaiClient, the same lexically-unmatchable query finds nothing", async () => {
    const owner = await signUpTestUser("owner");
    const { companyId, productId } = await seedCompanyWithProduct(owner.cookieHeader, "No Vector Client Co", {
      name: "Camisa Corinthians",
      category: "Esporte",
    });

    const supabase = getTestServiceClient();
    await supabase.from("products").update({ embedding: fakeVector("sports") }).eq("id", productId);

    const results = await ProductRepository.search({ companyId, keywords: ["time"] }, supabase);

    expect(results).toEqual([]);
  });

  // Precision check, the mirror image of the recall test above -- but note
  // what this actually asserts. The vector leg has no similarity/distance
  // *threshold* (see vector_top in the migration): it's a plain top-50
  // nearest-neighbour pool, so with only two products in this company, the
  // "unrelated" one still gets a (lower) RRF score and appears in the
  // results -- it just ranks behind the real match, never ahead of or
  // instead of it. A hard cutoff was deliberately left out rather than
  // guessed at: real embedding models don't have a universal "unrelated"
  // distance, and an untuned threshold risks silently re-introducing the
  // exact recall gap this feature exists to close. See decisions.md.
  it("ranks a semantically related product above an unrelated one, even with only two candidates", async () => {
    const owner = await signUpTestUser("owner");
    const supabase = getTestServiceClient();

    const sports = await seedCompanyWithProduct(owner.cookieHeader, "Precision Co", {
      name: "Camisa Corinthians",
      category: "Esporte",
    });
    const kitchen = await api<{ product: { id: string } }>(
      "POST",
      `/api/companies/${sports.companyId}/products`,
      owner.cookieHeader,
      { name: "Panela de Pressão", category: "Casa" },
    );

    await supabase.from("products").update({ embedding: fakeVector("sports") }).eq("id", sports.productId);
    await supabase
      .from("products")
      .update({ embedding: fakeVector("kitchenware") })
      .eq("id", kitchen.json.product.id);

    const results = await ProductRepository.search(
      { companyId: sports.companyId, keywords: ["time"] },
      supabase,
      fakeOpenAiReturning(fakeVector("sports")),
    );

    const ids = results.map((p) => p.id);
    expect(ids.indexOf(sports.productId)).toBeGreaterThanOrEqual(0);
    const kitchenIndex = ids.indexOf(kitchen.json.product.id);
    if (kitchenIndex !== -1) {
      expect(ids.indexOf(sports.productId)).toBeLessThan(kitchenIndex);
    }
  });

  // A product that already matches lexically must still win -- hybrid
  // search adds recall, it must never remove precision from the path that
  // already worked (2026-08-29's earlier "no needless relax" test pins the
  // same invariant for the pure-lexical relaxation).
  it("still returns a real lexical match when no embedding is involved at all", async () => {
    const owner = await signUpTestUser("owner");
    const { companyId, productId } = await seedCompanyWithProduct(owner.cookieHeader, "Lexical Still Works Co", {
      name: "Camiseta Azul",
    });

    const results = await ProductRepository.search(
      { companyId, keywords: ["camiseta azul"] },
      getTestServiceClient(),
      fakeOpenAiReturning(fakeVector("kitchenware")),
    );

    expect(results.map((p) => p.id)).toContain(productId);
  });
});
