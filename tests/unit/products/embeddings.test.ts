import { afterEach, describe, expect, it, vi } from "vitest";
import {
  EMBEDDING_DIMENSIONS,
  EMBEDDING_MODEL,
  buildProductEmbeddingInput,
  createProductEmbedding,
  createProductEmbeddingsBatch,
} from "@/lib/products/embeddings";
import type OpenAI from "openai";

// Hybrid product search's semantic leg -- see the SQL migration
// (20260829150000_add_product_embeddings) for what these vectors feed.
// Every function here has a hard rule pinned by these tests: never throw,
// never block a product write over an embeddings API problem.

function fakeOpenAi(create: ReturnType<typeof vi.fn>): OpenAI {
  return { embeddings: { create } } as unknown as OpenAI;
}

describe("buildProductEmbeddingInput", () => {
  it("joins name, category, and description, one per line", () => {
    expect(
      buildProductEmbeddingInput({ name: "Camisa Corinthians", category: "Futebol", description: "Uniforme oficial" }),
    ).toBe("Camisa Corinthians\nFutebol\nUniforme oficial");
  });

  it("omits a missing or blank field rather than leaving an empty line", () => {
    expect(buildProductEmbeddingInput({ name: "Camiseta Azul", category: null, description: null })).toBe(
      "Camiseta Azul",
    );
    expect(buildProductEmbeddingInput({ name: "Camiseta Azul", category: "  ", description: undefined })).toBe(
      "Camiseta Azul",
    );
  });
});

describe("createProductEmbedding", () => {
  afterEach(() => {
    delete process.env.DISABLE_PRODUCT_EMBEDDINGS;
  });

  it("calls the embeddings API with the pinned model/dimensions and returns the vector", async () => {
    const create = vi.fn().mockResolvedValue({ data: [{ embedding: [0.1, 0.2, 0.3] }] });

    const result = await createProductEmbedding("Camiseta Azul\nRoupas", fakeOpenAi(create));

    expect(result).toEqual([0.1, 0.2, 0.3]);
    expect(create).toHaveBeenCalledWith({
      model: EMBEDDING_MODEL,
      dimensions: EMBEDDING_DIMENSIONS,
      input: "Camiseta Azul\nRoupas",
    });
  });

  it("returns null for blank input without calling the API at all", async () => {
    const create = vi.fn();
    expect(await createProductEmbedding("   ", fakeOpenAi(create))).toBeNull();
    expect(create).not.toHaveBeenCalled();
  });

  // The load-bearing guarantee: a product write must never fail because the
  // embeddings API had a bad day. See products/route.ts's own comment on
  // why write-time generation was chosen over a backfill-only job in the
  // first place -- this is what makes that choice safe.
  it("degrades to null instead of throwing when the API call fails", async () => {
    const create = vi.fn().mockRejectedValue(new Error("rate limited"));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await createProductEmbedding("Camiseta Azul", fakeOpenAi(create));

    expect(result).toBeNull();
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it("returns null and never calls the API when disabled for tests", async () => {
    process.env.DISABLE_PRODUCT_EMBEDDINGS = "true";
    const create = vi.fn();

    expect(await createProductEmbedding("Camiseta Azul", fakeOpenAi(create))).toBeNull();
    expect(create).not.toHaveBeenCalled();
  });
});

describe("createProductEmbeddingsBatch", () => {
  afterEach(() => {
    delete process.env.DISABLE_PRODUCT_EMBEDDINGS;
  });

  it("makes one batched call and returns vectors in input order", async () => {
    const create = vi.fn().mockResolvedValue({
      data: [{ embedding: [1, 0, 0] }, { embedding: [0, 1, 0] }],
    });

    const result = await createProductEmbeddingsBatch(["Produto A", "Produto B"], fakeOpenAi(create));

    expect(result).toEqual([[1, 0, 0], [0, 1, 0]]);
    expect(create).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ input: ["Produto A", "Produto B"] }),
    );
  });

  // The alignment guarantee that makes zipping this back onto product rows
  // safe: a blank row must not shift every subsequent vector out of place.
  it("keeps blank entries in place as null without sending them to the API", async () => {
    const create = vi.fn().mockResolvedValue({ data: [{ embedding: [1, 1, 1] }] });

    const result = await createProductEmbeddingsBatch(["Produto A", "  ", "Produto C"], fakeOpenAi(create));

    expect(create).toHaveBeenCalledWith(expect.objectContaining({ input: ["Produto A", "Produto C"] }));
    // Only the second call's embedding is asserted here (the mock always
    // returns one item); the point under test is the null stays at index 1.
    expect(result[1]).toBeNull();
    expect(result).toHaveLength(3);
  });

  it("returns an all-null, same-length array without calling the API when every entry is blank", async () => {
    const create = vi.fn();
    expect(await createProductEmbeddingsBatch(["", "  "], fakeOpenAi(create))).toEqual([null, null]);
    expect(create).not.toHaveBeenCalled();
  });

  it("degrades the whole batch to null rather than throwing on API failure", async () => {
    const create = vi.fn().mockRejectedValue(new Error("outage"));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await createProductEmbeddingsBatch(["Produto A", "Produto B"], fakeOpenAi(create));

    expect(result).toEqual([null, null]);
    errorSpy.mockRestore();
  });

  it("returns all-null and never calls the API when disabled for tests", async () => {
    process.env.DISABLE_PRODUCT_EMBEDDINGS = "true";
    const create = vi.fn();

    expect(await createProductEmbeddingsBatch(["Produto A", "Produto B"], fakeOpenAi(create))).toEqual([null, null]);
    expect(create).not.toHaveBeenCalled();
  });
});
