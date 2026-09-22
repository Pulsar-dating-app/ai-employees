import { describe, expect, it, vi } from "vitest";
import { searchProductsTool } from "@/lib/agent-engine/tools/search-products";
import type { ToolExecutionContext } from "@/lib/agent-engine/tools/types";

// This repo's first vi.mock -- reasonable here since search-products.ts is
// a thin wrapper around B5's already-tested ProductRepository; we're only
// verifying the wrapper's own contract (schema shape, companyId trust),
// not re-testing the repository's search behavior.
vi.mock("@/lib/products/repository", () => ({
  ProductRepository: {
    search: vi.fn().mockResolvedValue([]),
    // Non-empty by default so the schema/passthrough tests below (which
    // don't care about the empty-catalog branch) never take the extra
    // hasProducts() round trip.
    hasProducts: vi.fn().mockResolvedValue(true),
  },
}));

import { ProductRepository } from "@/lib/products/repository";

function fakeToolCtx(companyId: string): ToolExecutionContext {
  return {
    companyId,
    agentId: "agent-1",
    conversationId: "conversation-1",
    customerId: "customer-1",
    supabase: {} as ToolExecutionContext["supabase"],
    openai: {} as ToolExecutionContext["openai"],
  };
}

describe("searchProductsTool", () => {
  it("has a well-formed JSON Schema (object type, no additional properties)", () => {
    expect(searchProductsTool.parameters).toMatchObject({
      type: "object",
      additionalProperties: false,
    });
  });

  it("passes ctx.companyId to ProductRepository.search, ignoring any companyId in args", async () => {
    await searchProductsTool.execute(
      { keywords: ["widget"], companyId: "attacker-supplied-company-id" },
      fakeToolCtx("trusted-company-id"),
    );

    expect(ProductRepository.search).toHaveBeenCalledWith(
      expect.objectContaining({ companyId: "trusted-company-id", keywords: ["widget"] }),
      expect.anything(),
      expect.anything(),
    );
  });

  it("passes ctx.supabase and ctx.openai through instead of building its own clients", async () => {
    const ctx = fakeToolCtx("trusted-company-id");
    await searchProductsTool.execute({ keywords: ["widget"] }, ctx);

    // ctx.openai is what turns on hybrid search's semantic leg (see
    // ProductRepository.search's own comment on why it isn't defaulted).
    expect(ProductRepository.search).toHaveBeenCalledWith(expect.anything(), ctx.supabase, ctx.openai);
  });

  // Chat testing: Malu invented categories ("roupas, calçados, acessórios")
  // on an account with no products at all -- the tool's own description used
  // to say every empty result just means "try different keywords," which is
  // actively wrong advice on a genuinely empty catalog.
  it("wraps a non-empty result as { products }, without querying hasProducts", async () => {
    vi.mocked(ProductRepository.search).mockResolvedValueOnce([{ id: "p1" } as never]);
    vi.mocked(ProductRepository.hasProducts).mockClear();

    const result = await searchProductsTool.execute({ keywords: ["widget"] }, fakeToolCtx("co-1"));

    expect(result).toEqual({ products: [{ id: "p1" }] });
    expect(ProductRepository.hasProducts).not.toHaveBeenCalled();
  });

  it("wraps an empty result as { products: [] } (no catalogEmpty) when the catalog has other products", async () => {
    vi.mocked(ProductRepository.search).mockResolvedValueOnce([]);
    vi.mocked(ProductRepository.hasProducts).mockResolvedValueOnce(true);

    const result = await searchProductsTool.execute({ keywords: ["widget"] }, fakeToolCtx("co-1"));

    expect(result).toEqual({ products: [] });
  });

  it("flags catalogEmpty when the search found nothing and the company has no products at all", async () => {
    vi.mocked(ProductRepository.search).mockResolvedValueOnce([]);
    vi.mocked(ProductRepository.hasProducts).mockResolvedValueOnce(false);

    const result = await searchProductsTool.execute({ keywords: ["widget"] }, fakeToolCtx("co-1"));

    expect(result).toEqual({ products: [], catalogEmpty: true });
    expect(ProductRepository.hasProducts).toHaveBeenCalledWith("co-1", expect.anything());
  });
});
