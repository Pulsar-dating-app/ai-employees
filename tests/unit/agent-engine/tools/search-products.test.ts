import { describe, expect, it, vi } from "vitest";
import { searchProductsTool } from "@/lib/agent-engine/tools/search-products";
import type { ToolExecutionContext } from "@/lib/agent-engine/tools/types";

// This repo's first vi.mock -- reasonable here since search-products.ts is
// a thin wrapper around B5's already-tested ProductRepository; we're only
// verifying the wrapper's own contract (schema shape, companyId trust),
// not re-testing the repository's search behavior.
vi.mock("@/lib/products/repository", () => ({
  ProductRepository: { search: vi.fn().mockResolvedValue([]) },
}));

import { ProductRepository } from "@/lib/products/repository";

function fakeToolCtx(companyId: string): ToolExecutionContext {
  return {
    companyId,
    conversationId: "conversation-1",
    customerId: "customer-1",
    supabase: {} as ToolExecutionContext["supabase"],
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
      { text: "widget", companyId: "attacker-supplied-company-id" },
      fakeToolCtx("trusted-company-id"),
    );

    expect(ProductRepository.search).toHaveBeenCalledWith(
      expect.objectContaining({ companyId: "trusted-company-id", text: "widget" }),
      expect.anything(),
    );
  });

  it("passes ctx.supabase through instead of letting ProductRepository build its own client", async () => {
    const ctx = fakeToolCtx("trusted-company-id");
    await searchProductsTool.execute({ text: "widget" }, ctx);

    expect(ProductRepository.search).toHaveBeenCalledWith(expect.anything(), ctx.supabase);
  });
});
