import { beforeEach, describe, expect, it, vi } from "vitest";
import { createCheckoutLinkTool } from "@/lib/agent-engine/tools/create-checkout-link";
import type { ToolExecutionContext } from "@/lib/agent-engine/tools/types";

// Same justification as get-product.test.ts: this tool is a thin wrapper over
// already-tested code (ProductRepository is covered by its own integration
// test), so mocking it here keeps this file about the wrapper's own contract.
vi.mock("@/lib/products/repository", () => ({
  ProductRepository: { get: vi.fn() },
}));

import { ProductRepository } from "@/lib/products/repository";

process.env.SIDDE_CHECKOUT_BASE_URL = "https://app.example.com";

type InsertCall = Record<string, unknown>;

function fakeToolCtx(companyId: string) {
  const inserts: InsertCall[] = [];
  const ctx = {
    companyId,
    agentId: "agent-1",
    conversationId: "conversation-1",
    customerId: "customer-1",
    supabase: {
      from: () => ({
        insert: (row: InsertCall) => {
          inserts.push(row);
          return Promise.resolve({ error: null });
        },
      }),
    } as unknown as ToolExecutionContext["supabase"],
    openai: {} as ToolExecutionContext["openai"],
  } satisfies ToolExecutionContext;
  return { ctx, inserts };
}

const PRODUCT = {
  id: "prod-1",
  name: "Vestido Luna",
  product_url: "https://loja.example.com/vestido-luna",
};

beforeEach(() => {
  vi.mocked(ProductRepository.get).mockReset();
});

describe("createCheckoutLinkTool", () => {
  it("requires productId in its schema", () => {
    expect(createCheckoutLinkTool.parameters).toMatchObject({
      type: "object",
      required: ["productId"],
      additionalProperties: false,
    });
  });

  it("always uses ctx.companyId, never a companyId smuggled into args", async () => {
    vi.mocked(ProductRepository.get).mockResolvedValue(PRODUCT as never);
    const { ctx } = fakeToolCtx("trusted-company-id");

    await createCheckoutLinkTool.execute(
      { productId: "prod-1", companyId: "attacker-supplied-company-id" },
      ctx,
    );

    expect(ProductRepository.get).toHaveBeenCalledWith("trusted-company-id", "prod-1", ctx.supabase);
  });

  it("writes a product_recommendation event carrying the link's identity", async () => {
    vi.mocked(ProductRepository.get).mockResolvedValue(PRODUCT as never);
    const { ctx, inserts } = fakeToolCtx("company-1");

    const result = await createCheckoutLinkTool.execute({ productId: "prod-1" }, ctx);

    expect(inserts).toHaveLength(1);
    expect(inserts[0]).toMatchObject({
      company_id: "company-1",
      agent_id: "agent-1",
      conversation_id: "conversation-1",
      customer_id: "customer-1",
      product_id: "prod-1",
      // Not checkout_click: that's recorded by E1 when the customer actually
      // taps the link. See the file comment on the tool.
      type: "product_recommendation",
      metadata: { destination_url: PRODUCT.product_url },
    });

    const trackingId = inserts[0].tracking_id as string;
    expect(trackingId).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(result).toMatchObject({
      available: true,
      checkoutUrl: `https://app.example.com/c/${trackingId}`,
      productId: "prod-1",
      productName: "Vestido Luna",
    });
  });

  it("reports unavailable, and writes nothing, when the product does not exist", async () => {
    vi.mocked(ProductRepository.get).mockResolvedValue(null);
    const { ctx, inserts } = fakeToolCtx("company-1");

    const result = await createCheckoutLinkTool.execute({ productId: "missing" }, ctx);

    expect(result).toEqual({ available: false, reason: "product_not_found" });
    expect(inserts).toHaveLength(0);
  });

  it("reports unavailable when the merchant has not set the product's URL", async () => {
    vi.mocked(ProductRepository.get).mockResolvedValue({ ...PRODUCT, product_url: null } as never);
    const { ctx, inserts } = fakeToolCtx("company-1");

    const result = await createCheckoutLinkTool.execute({ productId: "prod-1" }, ctx);

    expect(result).toEqual({ available: false, reason: "product_has_no_url" });
    expect(inserts).toHaveLength(0);
  });
});
