import { describe, expect, it, vi } from "vitest";
import { getPolicyInformationTool } from "@/lib/agent-engine/tools/get-policy-information";
import type { ToolExecutionContext } from "@/lib/agent-engine/tools/types";

// Trello C3 -- mirrors search-products.test.ts's approach: thin wrapper,
// only its own contract (schema shape, companyId trust) is verified here.
vi.mock("@/lib/companies/repository", () => ({
  CompanyRepository: {
    getPolicyInformation: vi.fn().mockResolvedValue({ type: "shipping", available: false, content: null }),
  },
}));

import { CompanyRepository } from "@/lib/companies/repository";

function fakeToolCtx(companyId: string): ToolExecutionContext {
  return {
    companyId,
    agentId: "agent-1",
    conversationId: "conversation-1",
    customerId: "customer-1",
    supabase: {} as ToolExecutionContext["supabase"],
  };
}

describe("getPolicyInformationTool", () => {
  it("has a well-formed JSON Schema (object type, required type enum, no additional properties)", () => {
    expect(getPolicyInformationTool.parameters).toMatchObject({
      type: "object",
      required: ["type"],
      additionalProperties: false,
      properties: {
        type: { enum: ["shipping", "return", "payment", "faq"] },
      },
    });
  });

  it("passes ctx.companyId and args.type to CompanyRepository.getPolicyInformation, ignoring any companyId in args", async () => {
    await getPolicyInformationTool.execute(
      { type: "shipping", companyId: "attacker-supplied-company-id" },
      fakeToolCtx("trusted-company-id"),
    );

    expect(CompanyRepository.getPolicyInformation).toHaveBeenCalledWith(
      "trusted-company-id",
      "shipping",
      expect.anything(),
    );
  });

  it("passes ctx.supabase through instead of letting CompanyRepository build its own client", async () => {
    const ctx = fakeToolCtx("trusted-company-id");
    await getPolicyInformationTool.execute({ type: "faq" }, ctx);

    expect(CompanyRepository.getPolicyInformation).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      ctx.supabase,
    );
  });
});
