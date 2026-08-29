import { describe, expect, it } from "vitest";
import { requestHumanTool } from "@/lib/agent-engine/tools/request-human";
import type { ToolExecutionContext } from "@/lib/agent-engine/tools/types";

type UpdateCall = { table: string; values: Record<string, unknown>; eq: [string, unknown][] };

function fakeToolCtx(companyId: string, updateError: { message: string; code: string } | null = null) {
  const updates: UpdateCall[] = [];
  const ctx = {
    companyId,
    agentId: "agent-1",
    conversationId: "conversation-1",
    customerId: "customer-1",
    supabase: {
      from: (table: string) => ({
        update: (values: Record<string, unknown>) => {
          const call: UpdateCall = { table, values, eq: [] };
          updates.push(call);
          const builder = {
            eq: (column: string, value: unknown) => {
              call.eq.push([column, value]);
              // Chainable: .eq().eq() resolves on the final call, mirroring
              // supabase-js's thenable query builder.
              return call.eq.length < 2 ? builder : Promise.resolve({ error: updateError });
            },
          };
          return builder;
        },
      }),
    } as unknown as ToolExecutionContext["supabase"],
    openai: {} as ToolExecutionContext["openai"],
  } satisfies ToolExecutionContext;
  return { ctx, updates };
}

describe("requestHumanTool", () => {
  it("takes no arguments", () => {
    expect(requestHumanTool.parameters).toMatchObject({
      type: "object",
      properties: {},
      additionalProperties: false,
    });
  });

  // Regression test found manually testing: Malu never proactively offered
  // a human handoff -- she'd just keep apologizing if she couldn't resolve
  // something, with no path to escalate unless the customer named a human
  // explicitly. Asserts the description tells her to offer (not decide
  // unilaterally) after two failed attempts at the same question.
  it("instructs proactively offering a human after two failed attempts, not deciding unilaterally", () => {
    expect(requestHumanTool.description).toContain("after two attempts");
    expect(requestHumanTool.description).toContain("proactively OFFER");
    expect(requestHumanTool.description).toContain("only call this tool once they say yes");
  });

  it("pauses the conversation scoped to ctx.companyId, ignoring any companyId smuggled into args", async () => {
    const { ctx, updates } = fakeToolCtx("trusted-company-id");

    const result = await requestHumanTool.execute({ companyId: "attacker-supplied-company-id" }, ctx);

    expect(result).toEqual({ recorded: true });
    expect(updates).toEqual([
      {
        table: "conversations",
        values: { status: "paused" },
        eq: [
          ["id", "conversation-1"],
          ["company_id", "trusted-company-id"],
        ],
      },
    ]);
  });

  it("surfaces a Postgres update error rather than swallowing it", async () => {
    const { ctx } = fakeToolCtx("company-1", { message: "boom", code: "XX000" });

    await expect(requestHumanTool.execute({}, ctx)).rejects.toMatchObject({ code: "XX000" });
  });
});
