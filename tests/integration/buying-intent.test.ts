import { describe, expect, it, vi } from "vitest";
import { AgentEngine } from "@/lib/agent-engine";
import { flagBuyingIntentTool } from "@/lib/agent-engine/tools/flag-buying-intent";
import type { ToolExecutionContext } from "@/lib/agent-engine/tools/types";
import { api } from "./helpers/request";
import { signUpTestUser } from "./helpers/auth";
import { getTestServiceClient } from "./helpers/service-client";

// Trello ticket C6 -- like agent-engine.test.ts / checkout-link.test.ts,
// this imports the module directly rather than going over HTTP: there's no
// route for the tool (D2, the WhatsApp inbound webhook, isn't built). Real
// local Postgres throughout -- the point is asserting the `buying_intent`
// events row actually lands.
//
// Multilingual note: C6 is built as a model-called tool specifically so it
// works in every language (no keyword/regex list to be English-only). The
// fake OpenAI client below can't prove the *model* recognizes intent in
// Portuguese, but the round-trip case drives the pipeline with a
// Portuguese message and asserts the event lands -- confirming there is no
// language-specific code anywhere in the tool's own path.

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

async function seedConversation(
  owner: Awaited<ReturnType<typeof signUpTestUser>>,
  companyName: string,
) {
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
    .insert({ company_id: companyId, name: "Test Customer", phone: "+15550000010", channel: "whatsapp" })
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

async function createProduct(
  owner: Awaited<ReturnType<typeof signUpTestUser>>,
  companyId: string,
  body: Record<string, unknown>,
) {
  const res = await api<{ product: { id: string } }>(
    "POST",
    `/api/companies/${companyId}/products`,
    owner.cookieHeader,
    body,
  );
  return res.json.product.id;
}

function toolCtxFor(seed: Awaited<ReturnType<typeof seedConversation>>): ToolExecutionContext {
  return {
    companyId: seed.companyId,
    agentId: seed.agentId,
    conversationId: seed.conversationId,
    customerId: seed.customerId,
    supabase: getTestServiceClient(),
    openai: {} as ToolExecutionContext["openai"],
  };
}

describe("flag_buying_intent", () => {
  it("writes a real buying_intent event with no product when none is in context", async () => {
    const owner = await signUpTestUser("owner");
    const seed = await seedConversation(owner, "Buying Intent Co");

    const result = await flagBuyingIntentTool.execute({}, toolCtxFor(seed));
    expect(result).toEqual({ recorded: true });

    const { data: events, error } = await getTestServiceClient()
      .from("events")
      .select("*")
      .eq("conversation_id", seed.conversationId);
    if (error) throw error;

    expect(events).toHaveLength(1);
    expect(events![0]).toMatchObject({
      company_id: seed.companyId,
      agent_id: seed.agentId,
      conversation_id: seed.conversationId,
      customer_id: seed.customerId,
      product_id: null,
      type: "buying_intent",
      tracking_id: null,
    });
  });

  it("records the product_id when the customer's intent is about a specific product", async () => {
    const owner = await signUpTestUser("owner");
    const seed = await seedConversation(owner, "Intent With Product Co");
    const productId = await createProduct(owner, seed.companyId, { name: "Tênis Corrida" });

    await flagBuyingIntentTool.execute({ productId }, toolCtxFor(seed));

    const { data: event, error } = await getTestServiceClient()
      .from("events")
      .select("product_id, type")
      .eq("conversation_id", seed.conversationId)
      .single();
    if (error) throw error;

    expect(event).toEqual({ product_id: productId, type: "buying_intent" });
  });

  it("drops a product_id belonging to another company but still records the intent", async () => {
    const owner = await signUpTestUser("owner");
    const seed = await seedConversation(owner, "Tenant A Co");
    const other = await seedConversation(owner, "Tenant B Co");
    const otherProductId = await createProduct(owner, other.companyId, { name: "Other Tenant Product" });

    const result = await flagBuyingIntentTool.execute({ productId: otherProductId }, toolCtxFor(seed));
    expect(result).toEqual({ recorded: true });

    const { data: event, error } = await getTestServiceClient()
      .from("events")
      .select("product_id, type")
      .eq("conversation_id", seed.conversationId)
      .single();
    if (error) throw error;

    expect(event).toEqual({ product_id: null, type: "buying_intent" });
  });

  it("fires through a full AgentEngine.run driven by a Portuguese message", async () => {
    const owner = await signUpTestUser("owner");
    const seed = await seedConversation(owner, "Engine Round Trip Co");

    const responsesCreate = vi
      .fn()
      .mockResolvedValueOnce(functionCallResponse("call_1", "flag_buying_intent", {}))
      .mockResolvedValueOnce(textResponse("Perfeito! Vou te ajudar a fechar o pedido."));
    const openai = {
      conversations: { create: vi.fn().mockResolvedValue({ id: fakeOpenAiConversationId() }) },
      responses: { create: responsesCreate },
    } as never;

    const result = await AgentEngine.run(
      { companyId: seed.companyId, conversationId: seed.conversationId, message: "quero esse, como faço pra comprar?" },
      { supabase: getTestServiceClient(), openai },
    );

    expect(result.responseText).toBe("Perfeito! Vou te ajudar a fechar o pedido.");

    const toolOutput = JSON.parse(responsesCreate.mock.calls[1][0].input[0].output);
    expect(toolOutput).toEqual({ recorded: true });

    const { data: events, error } = await getTestServiceClient()
      .from("events")
      .select("type")
      .eq("conversation_id", seed.conversationId);
    if (error) throw error;
    expect(events).toEqual([{ type: "buying_intent" }]);
  });
});
