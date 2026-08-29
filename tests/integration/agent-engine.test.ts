import { describe, expect, it, vi } from "vitest";
import { AgentEngine } from "@/lib/agent-engine";
import {
  AgentUnavailableError,
  ConversationCompanyMismatchError,
} from "@/lib/agent-engine/errors";
import { api } from "./helpers/request";
import { signUpTestUser } from "./helpers/auth";
import { getTestServiceClient } from "./helpers/service-client";

// Trello ticket C1 -- unlike every other file in this directory, this test
// imports AgentEngine.run() directly instead of going over HTTP: there is
// no route to hit yet (D2, the WhatsApp inbound webhook, isn't built). This
// is a deliberate deviation from the "always over real HTTP" convention,
// not an oversight -- see .claude/docs/architecture.md#testing.
//
// deps.supabase is the *real* local Supabase service-role client (so the
// steps that touch Postgres -- config/customer/knowledge loading,
// open_ai_conversation_id persistence -- are genuinely exercised, matching
// this repo's "prefer real Postgres over mocks" rule). deps.openai is a
// hand-built fake: no real OpenAI calls happen in automated tests.

function textResponse(text: string) {
  return { output: [], output_text: text };
}

function functionCallResponse(callId: string, name: string, args: Record<string, unknown>) {
  return {
    output: [{ type: "function_call", call_id: callId, name, arguments: JSON.stringify(args) }],
    output_text: "",
  };
}

function fakeOpenAiConversationId() {
  return `conv_fake_${Math.random().toString(36).slice(2)}`;
}

async function seedConversation(owner: Awaited<ReturnType<typeof signUpTestUser>>, companyName: string) {
  const created = await api<{ company: { id: string } }>("POST", "/api/companies", owner.cookieHeader, {
    name: companyName,
  });
  const companyId = created.json.company.id;

  const hired = await api<{ companyAgent: { agent_id: string } }>(
    "POST",
    `/api/companies/${companyId}/agents/malu`,
    owner.cookieHeader,
  );
  const agentId = hired.json.companyAgent.agent_id;

  const { data: customer, error: customerError } = await owner.client
    .from("customers")
    .insert({ company_id: companyId, name: "Test Customer", phone: "+15550000000", channel: "whatsapp" })
    .select()
    .single();
  if (customerError) throw customerError;

  const { data: conversation, error: conversationError } = await owner.client
    .from("conversations")
    .insert({
      company_id: companyId,
      agent_id: agentId,
      customer_id: customer.id,
      channel: "whatsapp",
      status: "active",
    })
    .select()
    .single();
  if (conversationError) throw conversationError;

  return { companyId, agentId, customerId: customer.id, conversationId: conversation.id as string };
}

describe("AgentEngine.run", () => {
  it("runs end to end against real Postgres data, with system_prompt still null", async () => {
    const owner = await signUpTestUser("owner");
    const { companyId, conversationId } = await seedConversation(owner, "Agent Engine Co");

    const create = vi.fn().mockResolvedValueOnce(textResponse("Hi! How can I help?"));
    const openai = {
      conversations: { create: vi.fn().mockResolvedValue({ id: fakeOpenAiConversationId() }) },
      responses: { create },
    } as never;

    const result = await AgentEngine.run(
      { companyId, conversationId, message: "Hello" },
      { supabase: getTestServiceClient(), openai },
    );

    expect(result.responseText).toBe("Hi! How can I help?");
    expect(result.conversationId).toBe(conversationId);
  });

  it("creates the OpenAI conversation once and reuses it on a second run", async () => {
    const owner = await signUpTestUser("owner");
    const { companyId, conversationId } = await seedConversation(owner, "Reuse Conversation Co");

    const openAiConversationsCreate = vi.fn().mockResolvedValue({ id: fakeOpenAiConversationId() });
    const openai = {
      conversations: { create: openAiConversationsCreate },
      responses: { create: vi.fn().mockResolvedValue(textResponse("ok")) },
    } as never;
    const supabase = getTestServiceClient();

    const first = await AgentEngine.run({ companyId, conversationId, message: "Hi" }, { supabase, openai });
    const second = await AgentEngine.run({ companyId, conversationId, message: "Still there?" }, { supabase, openai });

    expect(openAiConversationsCreate).toHaveBeenCalledTimes(1);
    expect(second.openAiConversationId).toBe(first.openAiConversationId);
  });

  it("round-trips a real search_products tool call through the real ProductRepository", async () => {
    const owner = await signUpTestUser("owner");
    const { companyId, conversationId } = await seedConversation(owner, "Tool Round Trip Co");

    const product = await api<{ product: { id: string; name: string } }>(
      "POST",
      `/api/companies/${companyId}/products`,
      owner.cookieHeader,
      { name: "Blue Lantern", description: "A camping accessory" },
    );

    const responsesCreate = vi
      .fn()
      .mockResolvedValueOnce(functionCallResponse("call_1", "search_products", { keywords: ["lantern"] }))
      .mockResolvedValueOnce(textResponse("We have the Blue Lantern in stock!"));
    const openai = {
      conversations: { create: vi.fn().mockResolvedValue({ id: fakeOpenAiConversationId() }) },
      responses: { create: responsesCreate },
    } as never;

    const result = await AgentEngine.run(
      { companyId, conversationId, message: "Do you have a lantern?" },
      { supabase: getTestServiceClient(), openai },
    );

    expect(result.responseText).toBe("We have the Blue Lantern in stock!");

    const secondCallInput = responsesCreate.mock.calls[1][0].input;
    const toolOutput = JSON.parse(secondCallInput[0].output);
    expect(toolOutput.map((p: { id: string }) => p.id)).toContain(product.json.product.id);
  });

  // Trello C3 -- proves the two new grounding tools are actually wired into
  // the registry and reachable end to end, not just unit-tested in
  // isolation (tests/unit/agent-engine/tools/get-business-information.test.ts
  // and get-policy-information.test.ts cover the wrapper contract itself;
  // this is the same "round-trip through the real repository" shape as the
  // existing search_products test above).
  it("round-trips real get_business_information and get_policy_information tool calls", async () => {
    const owner = await signUpTestUser("owner");
    const { companyId, conversationId } = await seedConversation(owner, "Grounding Tools Co");

    await api("PATCH", `/api/companies/${companyId}`, owner.cookieHeader, {
      shipping_policy: "Ships within 5 business days.",
    });

    const responsesCreate = vi
      .fn()
      .mockResolvedValueOnce(functionCallResponse("call_1", "get_business_information", {}))
      .mockResolvedValueOnce(functionCallResponse("call_2", "get_policy_information", { type: "shipping" }))
      .mockResolvedValueOnce(textResponse("We're Grounding Tools Co, and we ship within 5 business days!"));
    const openai = {
      conversations: { create: vi.fn().mockResolvedValue({ id: fakeOpenAiConversationId() }) },
      responses: { create: responsesCreate },
    } as never;

    const result = await AgentEngine.run(
      { companyId, conversationId, message: "Who are you and what's your shipping policy?" },
      { supabase: getTestServiceClient(), openai },
    );

    expect(result.responseText).toBe("We're Grounding Tools Co, and we ship within 5 business days!");

    const businessInfoOutput = JSON.parse(responsesCreate.mock.calls[1][0].input[0].output);
    expect(businessInfoOutput.name).toBe("Grounding Tools Co");

    const policyOutput = JSON.parse(responsesCreate.mock.calls[2][0].input[0].output);
    expect(policyOutput).toEqual({
      type: "shipping",
      available: true,
      content: "Ships within 5 business days.",
    });
  });

  // Trello C5 -- proves request_human is actually wired into the registry
  // and reachable end to end (tests/unit/agent-engine/tools/request-human.test.ts
  // covers the wrapper's own contract in isolation), and that it really
  // pauses the real conversations row rather than just returning a shape.
  it("round-trips a real request_human tool call, pausing the conversation in Postgres", async () => {
    const owner = await signUpTestUser("owner");
    const { companyId, conversationId } = await seedConversation(owner, "Handoff Co");

    const responsesCreate = vi
      .fn()
      .mockResolvedValueOnce(functionCallResponse("call_1", "request_human", {}))
      .mockResolvedValueOnce(textResponse("Deixa que eu chamo alguém do time pra te ajudar com isso 😊"));
    const openai = {
      conversations: { create: vi.fn().mockResolvedValue({ id: fakeOpenAiConversationId() }) },
      responses: { create: responsesCreate },
    } as never;
    const supabase = getTestServiceClient();

    const result = await AgentEngine.run(
      { companyId, conversationId, message: "I want to speak to a real person about a complaint" },
      { supabase, openai },
    );

    expect(result.responseText).toBe("Deixa que eu chamo alguém do time pra te ajudar com isso 😊");

    const toolOutput = JSON.parse(responsesCreate.mock.calls[1][0].input[0].output);
    expect(toolOutput).toEqual({ recorded: true });

    const { data: conversation } = await supabase
      .from("conversations")
      .select("status")
      .eq("id", conversationId)
      .single();
    expect(conversation?.status).toBe("paused");
  });

  it("rejects when companyId doesn't match the conversation's own company", async () => {
    const owner = await signUpTestUser("owner");
    const { conversationId } = await seedConversation(owner, "Mismatch Co A");
    const { companyId: otherCompanyId } = await seedConversation(owner, "Mismatch Co B");

    await expect(
      AgentEngine.run(
        { companyId: otherCompanyId, conversationId, message: "hi" },
        { supabase: getTestServiceClient(), openai: {} as never },
      ),
    ).rejects.toBeInstanceOf(ConversationCompanyMismatchError);
  });

  it("rejects when the company never hired the conversation's agent", async () => {
    const owner = await signUpTestUser("owner");
    const created = await api<{ company: { id: string } }>("POST", "/api/companies", owner.cookieHeader, {
      name: "Never Hired Co",
    });
    const companyId = created.json.company.id;

    // Bypasses the hire route -- inserts a customer/conversation pointing at
    // Malu's global agents.id without a company_agents row ever existing.
    const supabase = getTestServiceClient();
    const { data: agent } = await supabase.from("agents").select("id").eq("slug", "malu").single();
    const { data: customer } = await owner.client
      .from("customers")
      .insert({ company_id: companyId, name: "C", channel: "whatsapp" })
      .select()
      .single();
    const { data: conversation } = await owner.client
      .from("conversations")
      .insert({ company_id: companyId, agent_id: agent!.id, customer_id: customer!.id, channel: "whatsapp" })
      .select()
      .single();

    await expect(
      AgentEngine.run(
        { companyId, conversationId: conversation!.id, message: "hi" },
        { supabase, openai: {} as never },
      ),
    ).rejects.toBeInstanceOf(AgentUnavailableError);
  });
});
