import { beforeAll, describe, expect, it, vi } from "vitest";
import { AgentEngine } from "@/lib/agent-engine";
import { api } from "./helpers/request";
import { signUpTestUser } from "./helpers/auth";
import { getTestServiceClient } from "./helpers/service-client";

// Trello ticket J2 -- the unit test pins the map; this pins the behaviour the
// map exists for: what the engine actually hands OpenAI for a given agent.
// A regression here (say, someone reinstating `deps.tools ?? defaultTools`)
// would leave the unit test green while Ana silently regained the ability to
// sell products.
//
// One signed-up user for the whole file: the suite already runs close to
// Supabase's `sign_in_sign_ups = 30` per-5-minutes-per-IP limit.

let shared: {
  owner: Awaited<ReturnType<typeof signUpTestUser>>;
  companyId: string;
};

beforeAll(async () => {
  const owner = await signUpTestUser("owner");
  const created = await api<{ company: { id: string } }>("POST", "/api/companies", owner.cookieHeader, {
    name: "J2 Tool Sets Co",
  });
  shared = { owner, companyId: created.json.company.id };
});

// Hires the agent (idempotent by B1's design) and opens a conversation with
// them, so both agents live under the same company.
async function conversationWith(agentSlug: string) {
  const hired = await api<{ companyAgent: { agent_id: string } }>(
    "POST",
    `/api/companies/${shared.companyId}/agents/${agentSlug}`,
    shared.owner.cookieHeader,
  );
  const agentId = hired.json.companyAgent.agent_id;

  const { data: customer } = await shared.owner.client
    .from("customers")
    .insert({ company_id: shared.companyId, name: `J2 ${agentSlug}`, channel: "whatsapp" })
    .select()
    .single();

  const { data: conversation } = await shared.owner.client
    .from("conversations")
    .insert({
      company_id: shared.companyId,
      agent_id: agentId,
      customer_id: customer!.id,
      channel: "whatsapp",
      status: "active",
    })
    .select()
    .single();

  return conversation!.id as string;
}

// Runs one turn and reports the tool names the engine offered the model.
async function toolNamesOfferedTo(agentSlug: string): Promise<string[]> {
  const conversationId = await conversationWith(agentSlug);

  const responsesCreate = vi.fn().mockResolvedValue({ output: [], output_text: "ok" });
  const openai = {
    conversations: { create: vi.fn().mockResolvedValue({ id: `conv_fake_${Math.random()}` }) },
    responses: { create: responsesCreate },
  } as never;

  await AgentEngine.run(
    { companyId: shared.companyId, conversationId, message: "oi" },
    { supabase: getTestServiceClient(), openai },
  );

  const offered = responsesCreate.mock.calls[0][0].tools as { name: string }[];
  return offered.map((tool) => tool.name);
}

describe("per-agent tool sets (J2)", () => {
  it("offers Malu the catalogue and checkout tools", async () => {
    const names = await toolNamesOfferedTo("malu");

    expect(names).toEqual(
      expect.arrayContaining([
        "search_products",
        "get_product",
        "create_checkout_link",
        "flag_buying_intent",
      ]),
    );
  });

  it("never offers Ana the catalogue or checkout tools", async () => {
    const names = await toolNamesOfferedTo("ana");

    expect(names).not.toContain("search_products");
    expect(names).not.toContain("get_product");
    expect(names).not.toContain("create_checkout_link");
    expect(names).not.toContain("flag_buying_intent");
  });

  it("offers Ana the scheduling tools (J3)", async () => {
    const names = await toolNamesOfferedTo("ana");

    expect(names).toEqual(
      expect.arrayContaining([
        "list_services",
        "find_available_slots",
        "book_appointment",
        "cancel_appointment",
      ]),
    );
  });

  it("never offers Malu the scheduling tools", async () => {
    const names = await toolNamesOfferedTo("malu");

    expect(names).not.toContain("find_available_slots");
    expect(names).not.toContain("book_appointment");
    expect(names).not.toContain("cancel_appointment");
  });

  it("offers both agents the shared business-knowledge and escalation tools", async () => {
    for (const slug of ["malu", "ana"]) {
      const names = await toolNamesOfferedTo(slug);
      expect(names, slug).toContain("get_business_information");
      expect(names, slug).toContain("get_policy_information");
      expect(names, slug).toContain("request_human");
    }
  });

  it("still lets deps.tools override the per-agent set entirely", async () => {
    // How every other test in the suite drives the loop with fakes -- if the
    // slug filter applied on top of an explicit list, those would break.
    const conversationId = await conversationWith("ana");
    const onlyTool = {
      name: "some_injected_tool",
      description: "injected",
      parameters: null,
      execute: async () => null,
    };

    const responsesCreate = vi.fn().mockResolvedValue({ output: [], output_text: "ok" });
    const openai = {
      conversations: { create: vi.fn().mockResolvedValue({ id: `conv_fake_${Math.random()}` }) },
      responses: { create: responsesCreate },
    } as never;

    await AgentEngine.run(
      { companyId: shared.companyId, conversationId, message: "oi" },
      { supabase: getTestServiceClient(), openai, tools: [onlyTool] },
    );

    const offered = (responsesCreate.mock.calls[0][0].tools as { name: string }[]).map((t) => t.name);
    expect(offered).toEqual(["some_injected_tool"]);
  });
});
