import { beforeEach, describe, expect, it, vi } from "vitest";
import { flagBuyingIntentTool } from "@/lib/agent-engine/tools/flag-buying-intent";
import type { ToolExecutionContext } from "@/lib/agent-engine/tools/types";

// Same justification as create-checkout-link.test.ts: this tool is a thin
// wrapper over already-tested code (ProductRepository has its own
// integration test), so mocking it keeps this file about the wrapper's own
// contract -- schema, ctx-over-args trust, and the row it writes.
vi.mock("@/lib/products/repository", () => ({
  ProductRepository: { get: vi.fn() },
}));

import { ProductRepository } from "@/lib/products/repository";

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

beforeEach(() => {
  vi.mocked(ProductRepository.get).mockReset();
});

describe("flagBuyingIntentTool", () => {
  it("takes only an optional productId, nothing required", () => {
    expect(flagBuyingIntentTool.parameters).toMatchObject({
      type: "object",
      additionalProperties: false,
      properties: { productId: { type: "string" } },
    });
    expect(flagBuyingIntentTool.parameters).not.toHaveProperty("required");
  });

  it("writes a buying_intent event from ctx identity, ignoring a companyId smuggled into args", async () => {
    const { ctx, inserts } = fakeToolCtx("trusted-company-id");

    const result = await flagBuyingIntentTool.execute(
      { companyId: "attacker-supplied-company-id" },
      ctx,
    );

    expect(result).toEqual({ recorded: true });
    expect(inserts).toEqual([
      {
        company_id: "trusted-company-id",
        agent_id: "agent-1",
        conversation_id: "conversation-1",
        customer_id: "customer-1",
        product_id: null,
        type: "buying_intent",
      },
    ]);
    // No productId in args -> no catalog lookup at all.
    expect(ProductRepository.get).not.toHaveBeenCalled();
  });

  it("records product_id when the model passes one that resolves in this company", async () => {
    vi.mocked(ProductRepository.get).mockResolvedValue({ id: "prod-1" } as never);
    const { ctx, inserts } = fakeToolCtx("company-1");

    await flagBuyingIntentTool.execute({ productId: "prod-1" }, ctx);

    expect(ProductRepository.get).toHaveBeenCalledWith("company-1", "prod-1", ctx.supabase);
    expect(inserts[0]).toMatchObject({ product_id: "prod-1", type: "buying_intent" });
  });

  it("drops an unresolvable/cross-tenant product_id but still records the intent", async () => {
    vi.mocked(ProductRepository.get).mockResolvedValue(null);
    const { ctx, inserts } = fakeToolCtx("company-1");

    const result = await flagBuyingIntentTool.execute({ productId: "stale-or-other-tenant" }, ctx);

    expect(result).toEqual({ recorded: true });
    expect(inserts[0]).toMatchObject({ product_id: null, type: "buying_intent" });
  });

  it("surfaces a Postgres insert error rather than swallowing it", async () => {
    const ctx = {
      companyId: "company-1",
      agentId: "agent-1",
      conversationId: "conversation-1",
      customerId: "customer-1",
      supabase: {
        from: () => ({
          insert: () => Promise.resolve({ error: { message: "boom", code: "XX000" } }),
        }),
      } as unknown as ToolExecutionContext["supabase"],
      openai: {} as ToolExecutionContext["openai"],
    } satisfies ToolExecutionContext;

    await expect(flagBuyingIntentTool.execute({}, ctx)).rejects.toMatchObject({ code: "XX000" });
  });
});
