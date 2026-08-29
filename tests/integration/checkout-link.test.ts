import { beforeAll, describe, expect, it, vi } from "vitest";
import { AgentEngine } from "@/lib/agent-engine";
import { createCheckoutLinkTool } from "@/lib/agent-engine/tools/create-checkout-link";
import type { ToolExecutionContext } from "@/lib/agent-engine/tools/types";
import { api } from "./helpers/request";
import { signUpTestUser } from "./helpers/auth";
import { getTestServiceClient } from "./helpers/service-client";

// Trello ticket C4 -- like agent-engine.test.ts, this imports the module
// directly rather than going over HTTP: there's no route for the tool (D2
// isn't built), and E1's redirect endpoint that consumes these links is its
// own separate ticket. Real local Postgres throughout -- the whole point is
// asserting the `events` row actually lands, which a mock would never catch.

const BASE_URL = "https://checkout-test.example";

beforeAll(() => {
  process.env.SIDDE_CHECKOUT_BASE_URL = BASE_URL;
});

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
    .insert({ company_id: companyId, name: "Test Customer", phone: "+15550000001", channel: "whatsapp" })
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

describe("create_checkout_link", () => {
  it("writes a real product_recommendation event and returns the /c/ link", async () => {
    const owner = await signUpTestUser("owner");
    const seed = await seedConversation(owner, "Checkout Link Co");
    const productId = await createProduct(owner, seed.companyId, {
      name: "Vestido Luna",
      product_url: "https://loja.example.com/vestido-luna",
    });

    const result = (await createCheckoutLinkTool.execute({ productId }, toolCtxFor(seed))) as {
      available: true;
      checkoutUrl: string;
      trackingId: string;
      productName: string;
    };

    expect(result.available).toBe(true);
    expect(result.productName).toBe("Vestido Luna");
    expect(result.checkoutUrl).toBe(`${BASE_URL}/c/${result.trackingId}`);

    const { data: event, error } = await getTestServiceClient()
      .from("events")
      .select("*")
      .eq("tracking_id", result.trackingId)
      .single();
    if (error) throw error;

    expect(event).toMatchObject({
      company_id: seed.companyId,
      agent_id: seed.agentId,
      conversation_id: seed.conversationId,
      customer_id: seed.customerId,
      product_id: productId,
      // Deliberately not checkout_click -- E1 records that when the customer
      // actually taps the link. See decisions.md.
      type: "product_recommendation",
    });
    expect(event.metadata).toEqual({ destination_url: "https://loja.example.com/vestido-luna" });
  });

  it("mints a distinct tracking id per call", async () => {
    const owner = await signUpTestUser("owner");
    const seed = await seedConversation(owner, "Distinct Ids Co");
    const productId = await createProduct(owner, seed.companyId, {
      name: "Repeat Product",
      product_url: "https://loja.example.com/repeat",
    });
    const ctx = toolCtxFor(seed);

    const first = (await createCheckoutLinkTool.execute({ productId }, ctx)) as { trackingId: string };
    const second = (await createCheckoutLinkTool.execute({ productId }, ctx)) as { trackingId: string };

    expect(first.trackingId).not.toBe(second.trackingId);
  });

  it("reports unavailable, and writes no event, when the product has no URL", async () => {
    const owner = await signUpTestUser("owner");
    const seed = await seedConversation(owner, "No Url Co");
    const productId = await createProduct(owner, seed.companyId, { name: "Unlinkable Product" });

    const result = await createCheckoutLinkTool.execute({ productId }, toolCtxFor(seed));

    expect(result).toEqual({ available: false, reason: "product_has_no_url" });

    const { data: events } = await getTestServiceClient()
      .from("events")
      .select("id")
      .eq("conversation_id", seed.conversationId);
    expect(events).toHaveLength(0);
  });

  it("cannot link a product belonging to another company", async () => {
    const owner = await signUpTestUser("owner");
    const seed = await seedConversation(owner, "Tenant A Co");
    const other = await seedConversation(owner, "Tenant B Co");
    const otherProductId = await createProduct(owner, other.companyId, {
      name: "Other Tenant Product",
      product_url: "https://loja.example.com/other",
    });

    const result = await createCheckoutLinkTool.execute({ productId: otherProductId }, toolCtxFor(seed));

    expect(result).toEqual({ available: false, reason: "product_not_found" });
  });

  it("reaches the model as a tool result through a full AgentEngine.run", async () => {
    const owner = await signUpTestUser("owner");
    const seed = await seedConversation(owner, "Engine Round Trip Co");
    const productId = await createProduct(owner, seed.companyId, {
      name: "Bolsa Sol",
      product_url: "https://loja.example.com/bolsa-sol",
    });

    const responsesCreate = vi
      .fn()
      .mockResolvedValueOnce(functionCallResponse("call_1", "create_checkout_link", { productId }))
      .mockResolvedValueOnce(textResponse("Aqui está o link!"));
    const openai = {
      conversations: { create: vi.fn().mockResolvedValue({ id: fakeOpenAiConversationId() }) },
      responses: { create: responsesCreate },
    } as never;

    const result = await AgentEngine.run(
      { companyId: seed.companyId, conversationId: seed.conversationId, message: "quero comprar, manda o link" },
      { supabase: getTestServiceClient(), openai },
    );

    expect(result.responseText).toBe("Aqui está o link!");

    const toolOutput = JSON.parse(responsesCreate.mock.calls[1][0].input[0].output);
    expect(toolOutput.available).toBe(true);
    expect(toolOutput.checkoutUrl).toBe(`${BASE_URL}/c/${toolOutput.trackingId}`);
  });
});
