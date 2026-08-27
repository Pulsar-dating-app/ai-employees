import { describe, expect, it, vi } from "vitest";
import { getProductTool } from "@/lib/agent-engine/tools/get-product";
import type { ToolExecutionContext } from "@/lib/agent-engine/tools/types";

vi.mock("@/lib/products/repository", () => ({
  ProductRepository: { get: vi.fn().mockResolvedValue(null) },
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

describe("getProductTool", () => {
  it("requires productId in its schema", () => {
    expect(getProductTool.parameters).toMatchObject({
      type: "object",
      required: ["productId"],
      additionalProperties: false,
    });
  });

  it("always uses ctx.companyId, never a companyId smuggled into args", async () => {
    const ctx = fakeToolCtx("trusted-company-id");
    await getProductTool.execute({ productId: "prod-1", companyId: "attacker-supplied-company-id" }, ctx);

    expect(ProductRepository.get).toHaveBeenCalledWith("trusted-company-id", "prod-1", ctx.supabase);
  });
});
