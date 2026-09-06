import { describe, expect, it } from "vitest";
import { api } from "./helpers/request";
import { getTestEnv } from "./helpers/env";
import { signUpTestUser } from "./helpers/auth";
import { getTestServiceClient } from "./helpers/service-client";

// Trello O1. Unlike WhatsApp/Instagram, there's no connect route to call
// first -- the deep link (company_agents.id as the /start payload) IS the
// connection. Tests hire the agent, then simulate opening that link by
// POSTing a /start update directly.
const TEST_WEBHOOK_SECRET = "test-telegram-webhook-secret";

describe("Telegram inbound webhook (POST receive)", () => {
  const { baseUrl } = getTestEnv();
  const service = getTestServiceClient();

  async function createCompany(ownerCookie: string, name: string) {
    const created = await api<{ company: { id: string } }>("POST", "/api/companies", ownerCookie, { name });
    return created.json.company.id;
  }

  async function hireAgent(ownerCookie: string, companyId: string, agentSlug: string) {
    const hired = await api<{ companyAgent: { id: string } }>(
      "POST",
      `/api/companies/${companyId}/agents/${agentSlug}`,
      ownerCookie,
    );
    return hired.json.companyAgent.id;
  }

  function startPayload(chatId: string, companyAgentId: string) {
    return JSON.stringify({ message: { message_id: 1, chat: { id: Number(chatId) }, text: `/start ${companyAgentId}` } });
  }

  function textPayload(chatId: string, text: string, messageId: number) {
    return JSON.stringify({ message: { message_id: messageId, chat: { id: Number(chatId) }, text } });
  }

  async function postWebhook(rawBody: string, secret: string | null) {
    return fetch(`${baseUrl}/api/webhooks/telegram`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(secret ? { "x-telegram-bot-api-secret-token": secret } : {}),
      },
      body: rawBody,
    });
  }

  describe("secret verification", () => {
    it("403s with no secret header", async () => {
      const res = await postWebhook(startPayload("111", "irrelevant"), null);
      expect(res.status).toBe(403);
    });

    it("403s with the wrong secret", async () => {
      const res = await postWebhook(startPayload("111", "irrelevant"), "wrong-secret");
      expect(res.status).toBe(403);
    });
  });

  describe("with a valid secret", () => {
    it("acks 200 for a /start payload naming a company_agents id that doesn't resolve", async () => {
      const res = await postWebhook(startPayload("222", "00000000-0000-0000-0000-000000000000"), TEST_WEBHOOK_SECRET);
      expect(res.status).toBe(200);
    });

    it("/start creates the customer and conversation and sends a welcome reply", async () => {
      const owner = await signUpTestUser("owner");
      const companyId = await createCompany(owner.cookieHeader, "Telegram Start Co");
      const companyAgentId = await hireAgent(owner.cookieHeader, companyId, "malu");

      const res = await postWebhook(startPayload("333333", companyAgentId), TEST_WEBHOOK_SECRET);
      expect(res.status).toBe(200);

      const { data: customer } = await service
        .from("customers")
        .select("id")
        .eq("company_id", companyId)
        .eq("channel", "telegram")
        .eq("telegram_chat_id", "333333")
        .single();
      expect(customer).toBeTruthy();

      const { data: conversations } = await service
        .from("conversations")
        .select("id, status")
        .eq("customer_id", (customer as { id: string }).id);
      expect(conversations).toHaveLength(1);
      expect((conversations as { status: string }[])[0].status).toBe("active");

      // /start itself never calls the Agent Engine or persists a message --
      // only the welcome reply is sent (not asserted here, no DB row for
      // it since it isn't a `messages` insert).
      const { data: messages } = await service.from("messages").select("id").eq("company_id", companyId);
      expect(messages).toHaveLength(0);
    });

    it("ignores a plain message from an unknown chat_id", async () => {
      const res = await postWebhook(textPayload("999999", "oi", 1), TEST_WEBHOOK_SECRET);
      expect(res.status).toBe(200);
    });

    it("is idempotent: a repeat delivery of the same message_id changes nothing", async () => {
      const owner = await signUpTestUser("owner");
      const companyId = await createCompany(owner.cookieHeader, "Telegram Idempotent Co");
      const companyAgentId = await hireAgent(owner.cookieHeader, companyId, "malu");
      await postWebhook(startPayload("444444", companyAgentId), TEST_WEBHOOK_SECRET);

      const body = textPayload("444444", "oi", 42);
      await postWebhook(body, TEST_WEBHOOK_SECRET);
      const res = await postWebhook(body, TEST_WEBHOOK_SECRET);
      expect(res.status).toBe(200);

      const { data: messages } = await service.from("messages").select("id").eq("company_id", companyId);
      expect(messages).toHaveLength(1);
    });

    // No real OPENAI_API_KEY in this suite (same limitation every other
    // channel's webhook test documents) -- a genuinely new message can't
    // get a real reply here, but the customer's message surviving an
    // Agent Engine failure is provable without one.
    it("persists the customer's message even when the Agent Engine call fails", async () => {
      const owner = await signUpTestUser("owner");
      const companyId = await createCompany(owner.cookieHeader, "Telegram New Message Co");
      const companyAgentId = await hireAgent(owner.cookieHeader, companyId, "malu");
      await postWebhook(startPayload("555555", companyAgentId), TEST_WEBHOOK_SECRET);

      const res = await postWebhook(textPayload("555555", "Vocês têm entrega?", 1), TEST_WEBHOOK_SECRET);
      expect(res.status).toBe(200);

      const { data: messages } = await service
        .from("messages")
        .select("role, content")
        .eq("company_id", companyId);
      expect(messages).toEqual([{ role: "customer", content: "Vocês têm entrega?" }]);
    });

    it("stays silent on a paused conversation but still persists the inbound message", async () => {
      const owner = await signUpTestUser("owner");
      const companyId = await createCompany(owner.cookieHeader, "Telegram Paused Co");
      const companyAgentId = await hireAgent(owner.cookieHeader, companyId, "malu");
      await postWebhook(startPayload("666666", companyAgentId), TEST_WEBHOOK_SECRET);

      const { data: customer } = await service
        .from("customers")
        .select("id")
        .eq("company_id", companyId)
        .eq("telegram_chat_id", "666666")
        .single();
      const { data: conversation } = await service
        .from("conversations")
        .select("id")
        .eq("customer_id", (customer as { id: string }).id)
        .single();
      await service.from("conversations").update({ status: "paused" }).eq("id", (conversation as { id: string }).id);

      const res = await postWebhook(textPayload("666666", "ainda aí?", 7), TEST_WEBHOOK_SECRET);
      expect(res.status).toBe(200);

      const { data: messages } = await service
        .from("messages")
        .select("role, content")
        .eq("conversation_id", (conversation as { id: string }).id);
      expect(messages).toEqual([{ role: "customer", content: "ainda aí?" }]);

      const { data: refetchedConversation } = await service
        .from("conversations")
        .select("status")
        .eq("id", (conversation as { id: string }).id)
        .single();
      expect((refetchedConversation as { status: string }).status).toBe("paused");
    });

    it("stays silent when the hire is paused (K6)", async () => {
      const owner = await signUpTestUser("owner");
      const companyId = await createCompany(owner.cookieHeader, "Telegram K6 Paused Co");
      const companyAgentId = await hireAgent(owner.cookieHeader, companyId, "malu");
      await postWebhook(startPayload("777777", companyAgentId), TEST_WEBHOOK_SECRET);
      await service.from("company_agents").update({ status: "paused" }).eq("id", companyAgentId);

      const res = await postWebhook(textPayload("777777", "oi", 3), TEST_WEBHOOK_SECRET);
      expect(res.status).toBe(200);

      const { data: messages } = await service.from("messages").select("id").eq("company_id", companyId);
      expect(messages).toHaveLength(0);
    });
  });
});
