import { describe, expect, it, vi } from "vitest";
import { getBusinessInformationTool } from "@/lib/agent-engine/tools/get-business-information";
import type { ToolExecutionContext } from "@/lib/agent-engine/tools/types";

// Trello C3 -- mirrors search-products.test.ts's approach: this is a thin
// wrapper around CompanyRepository, so only the wrapper's own contract
// (schema shape, companyId trust) is verified here, not repository
// behavior itself (covered by integration tests against real Postgres).
vi.mock("@/lib/companies/repository", () => ({
  CompanyRepository: {
    getBusinessInformation: vi.fn().mockResolvedValue({
      name: null,
      description: null,
      email: null,
      phone: null,
      websiteUrl: null,
      industry: null,
    }),
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

describe("getBusinessInformationTool", () => {
  it("has a well-formed JSON Schema (object type, no args, no additional properties)", () => {
    expect(getBusinessInformationTool.parameters).toMatchObject({
      type: "object",
      properties: {},
      additionalProperties: false,
    });
  });

  it("passes ctx.companyId to CompanyRepository.getBusinessInformation, ignoring any companyId in args", async () => {
    await getBusinessInformationTool.execute(
      { companyId: "attacker-supplied-company-id" },
      fakeToolCtx("trusted-company-id"),
    );

    expect(CompanyRepository.getBusinessInformation).toHaveBeenCalledWith(
      "trusted-company-id",
      expect.anything(),
    );
  });

  it("passes ctx.supabase through instead of letting CompanyRepository build its own client", async () => {
    const ctx = fakeToolCtx("trusted-company-id");
    await getBusinessInformationTool.execute({}, ctx);

    expect(CompanyRepository.getBusinessInformation).toHaveBeenCalledWith(expect.anything(), ctx.supabase);
  });
});
