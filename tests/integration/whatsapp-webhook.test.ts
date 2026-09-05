import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { api } from "./helpers/request";
import { getTestEnv } from "./helpers/env";
import { signUpTestUser } from "./helpers/auth";
import { getTestServiceClient } from "./helpers/service-client";

// Trello D2/D4. WhatsApp Cloud API is a classic Graph API product, so its
// webhook is signed with META_APP_SECRET (unlike Instagram's separate
// Business Login credentials -- see src/lib/whatsapp/webhook-signature.ts
// and decisions.md's 2026-09-01 entry on why that distinction matters).
const TEST_APP_SECRET = "test-meta-app-secret";

function sign(rawBody: string) {
  return `sha256=${createHmac("sha256", TEST_APP_SECRET).update(rawBody).digest("hex")}`;
}

describe("WhatsApp inbound webhook (GET verify, POST receive)", () => {
  const { baseUrl } = getTestEnv();
  const service = getTestServiceClient();

  async function createCompany(ownerCookie: string, name: string) {
    const created = await api<{ company: { id: string } }>("POST", "/api/companies", ownerCookie, { name });
    return created.json.company.id;
  }

  async function connectedAgent(
    ownerCookie: string,
    companyId: string,
    agentSlug: string,
    phoneNumberId: string,
    wabaId: string,
  ) {
    await api("POST", `/api/companies/${companyId}/agents/${agentSlug}`, ownerCookie);
    const connected = await api<{ connection: { phone_number_id: string } }>(
      "POST",
      `/api/companies/${companyId}/agents/${agentSlug}/whatsapp/connect`,
      ownerCookie,
      { code: "any-code", phoneNumberId, wabaId },
    );
    return connected.json.connection.phone_number_id;
  }

  // Trello D8 -- no phoneNumberId supplied by the caller; the connect route
  // resolves it server-side via finishCoexistenceConnection's
  // GET /{wabaId}/phone_numbers call (mocked in graph-api-mock.ts).
  async function connectedCoexistenceAgent(ownerCookie: string, companyId: string, agentSlug: string, wabaId: string) {
    await api("POST", `/api/companies/${companyId}/agents/${agentSlug}`, ownerCookie);
    return api<{ connection: { phone_number_id: string; is_coexistence: boolean } }>(
      "POST",
      `/api/companies/${companyId}/agents/${agentSlug}/whatsapp/connect`,
      ownerCookie,
      { code: "any-code", wabaId, isCoexistence: true },
    );
  }

  function echoPayload(phoneNumberId: string, to: string, text: string, messageId: string) {
    return JSON.stringify({
      object: "whatsapp_business_account",
      entry: [
        {
          id: "waba-irrelevant",
          changes: [
            {
              value: {
                metadata: { phone_number_id: phoneNumberId },
                message_echoes: [{ id: messageId, from: phoneNumberId, to, type: "text", text: { body: text } }],
              },
            },
          ],
        },
      ],
    });
  }

  function historyPayload(
    phoneNumberId: string,
    customerPhone: string,
    threadMessages: { from: string; text: string; messageId: string }[],
  ) {
    return JSON.stringify({
      object: "whatsapp_business_account",
      entry: [
        {
          id: "waba-irrelevant",
          changes: [
            {
              value: {
                metadata: { phone_number_id: phoneNumberId },
                history: [
                  {
                    threads: [
                      {
                        id: customerPhone,
                        messages: threadMessages.map((m) => ({
                          id: m.messageId,
                          from: m.from,
                          type: "text",
                          text: { body: m.text },
                        })),
                      },
                    ],
                  },
                ],
              },
            },
          ],
        },
      ],
    });
  }

  function messagingPayload(phoneNumberId: string, from: string, text: string, messageId: string) {
    return JSON.stringify({
      object: "whatsapp_business_account",
      entry: [
        {
          id: "waba-irrelevant",
          changes: [
            {
              value: {
                metadata: { phone_number_id: phoneNumberId },
                messages: [{ id: messageId, from, timestamp: String(Math.floor(Date.now() / 1000)), type: "text", text: { body: text } }],
              },
            },
          ],
        },
      ],
    });
  }

  async function postWebhook(rawBody: string, signature: string | null) {
    return fetch(`${baseUrl}/api/webhooks/whatsapp`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(signature ? { "x-hub-signature-256": signature } : {}),
      },
      body: rawBody,
    });
  }

  describe("GET verification", () => {
    it("echoes hub.challenge when the verify token matches", async () => {
      const res = await fetch(
        `${baseUrl}/api/webhooks/whatsapp?hub.mode=subscribe&hub.challenge=7654321&hub.verify_token=test-whatsapp-verify-token`,
      );
      expect(res.status).toBe(200);
      expect(await res.text()).toBe("7654321");
    });

    it("403s when the verify token doesn't match", async () => {
      const res = await fetch(
        `${baseUrl}/api/webhooks/whatsapp?hub.mode=subscribe&hub.challenge=7654321&hub.verify_token=wrong-token`,
      );
      expect(res.status).toBe(403);
    });
  });

  describe("POST signature verification", () => {
    it("403s with no signature header", async () => {
      const body = messagingPayload("irrelevant", "irrelevant", "hi", "msg-no-sig");
      const res = await postWebhook(body, null);
      expect(res.status).toBe(403);
    });

    it("403s with a signature computed from the wrong secret", async () => {
      const body = messagingPayload("irrelevant", "irrelevant", "hi", "msg-bad-sig");
      const badSignature = `sha256=${createHmac("sha256", "not-the-real-secret").update(body).digest("hex")}`;
      const res = await postWebhook(body, badSignature);
      expect(res.status).toBe(403);
    });
  });

  describe("POST with a valid signature", () => {
    it("acks 200 for a webhook naming a number with no live connection", async () => {
      const body = messagingPayload("no-such-number", "some-sender", "hi", "msg-unknown-number");
      const res = await postWebhook(body, sign(body));
      expect(res.status).toBe(200);
    });

    it("is idempotent: a repeat delivery of an already-processed message id changes nothing", async () => {
      const owner = await signUpTestUser("owner");
      const companyId = await createCompany(owner.cookieHeader, "WA Webhook Idempotent Co");
      const phoneNumberId = await connectedAgent(owner.cookieHeader, companyId, "malu", "phone-idempotent", "waba-idempotent");

      // Simulates "this message was already handled" directly, the same
      // state the route's own successful first run would leave behind --
      // without needing a real Agent Engine call just to set it up.
      const { data: customer } = await service
        .from("customers")
        .insert({ company_id: companyId, channel: "whatsapp", phone: "+5511900000001" })
        .select("id")
        .single();
      const { data: agentRow } = await service.from("agents").select("id").eq("slug", "malu").single();
      const { data: conversation } = await service
        .from("conversations")
        .insert({
          company_id: companyId,
          agent_id: (agentRow as { id: string }).id,
          customer_id: (customer as { id: string }).id,
          channel: "whatsapp",
          status: "active",
        })
        .select("id")
        .single();
      await service.from("messages").insert({
        company_id: companyId,
        conversation_id: (conversation as { id: string }).id,
        role: "customer",
        content: "already handled",
        external_message_id: "msg-repeat",
      });

      // P7: an active plan with a used-up-to-N counter for the period. A
      // redelivery must not tick this -- the 23505 on the message id stops
      // the route before the gate or recordAiReply.
      const periodStart = new Date().toISOString();
      await service.from("company_billing").insert({
        company_id: companyId,
        plan_key: "starter",
        subscription_status: "active",
        current_period_start: periodStart,
        current_period_end: new Date(Date.now() + 30 * 24 * 3600_000).toISOString(),
      });
      await service.from("company_message_usage").insert({
        company_id: companyId,
        period_start: periodStart,
        replies_used: 7,
        reply_limit: 10_000,
      });

      const body = messagingPayload(phoneNumberId, "+5511900000001", "a different retried text", "msg-repeat");
      const res = await postWebhook(body, sign(body));
      expect(res.status).toBe(200);

      const { data: messages } = await service
        .from("messages")
        .select("role, content")
        .eq("conversation_id", (conversation as { id: string }).id);
      // Still exactly the one row from setup -- no second customer message,
      // and critically no agent reply, proving the Agent Engine was never
      // reached for this delivery.
      expect(messages).toHaveLength(1);
      expect((messages as { content: string }[])[0].content).toBe("already handled");

      // And the reply counter didn't move (P7).
      const { data: usage } = await service
        .from("company_message_usage")
        .select("replies_used")
        .eq("company_id", companyId)
        .eq("period_start", periodStart)
        .single();
      expect((usage as { replies_used: number }).replies_used).toBe(7);
    });

    // This suite has no real OPENAI_API_KEY configured (same limitation
    // M3/N4's own tests document), so a genuinely new message can't get a
    // real reply here. What IS provable without a key is that the
    // customer's message survives even when the Agent Engine call itself
    // fails -- same property Instagram's N4 test verifies.
    it("persists the customer's message even when the Agent Engine call fails", async () => {
      const owner = await signUpTestUser("owner");
      const companyId = await createCompany(owner.cookieHeader, "WA Webhook New Message Co");
      const phoneNumberId = await connectedAgent(owner.cookieHeader, companyId, "malu", "phone-new-message", "waba-new-message");

      const body = messagingPayload(phoneNumberId, "+5511900000002", "Hi, do you have anything nice?", "msg-new-message");
      const res = await postWebhook(body, sign(body));
      expect(res.status).toBe(200); // Meta always gets 200 -- per-item failures are logged, not thrown.

      const { data: customer } = await service
        .from("customers")
        .select("id")
        .eq("company_id", companyId)
        .eq("channel", "whatsapp")
        .eq("phone", "+5511900000002")
        .single();
      expect(customer).toBeTruthy();

      const { data: messages } = await service
        .from("messages")
        .select("role, content, external_message_id")
        .eq("company_id", companyId);
      const rows = messages as { role: string; content: string; external_message_id: string | null }[];

      expect(rows).toHaveLength(1);
      expect(rows[0].role).toBe("customer");
      expect(rows[0].external_message_id).toBe("msg-new-message");
      expect(rows[0].content).toBe("Hi, do you have anything nice?");
    });

    // Trello N9's fix, applied identically here via resolveWhatsappSession:
    // a paused conversation must be reused (not orphaned into a fresh
    // 'active' one) and the webhook must skip the engine on 'paused'.
    it("stays silent on a paused conversation but still persists the inbound message", async () => {
      const owner = await signUpTestUser("owner");
      const companyId = await createCompany(owner.cookieHeader, "WA Webhook Paused Co");
      const phoneNumberId = await connectedAgent(owner.cookieHeader, companyId, "malu", "phone-paused", "waba-paused");

      const { data: customer } = await service
        .from("customers")
        .insert({ company_id: companyId, channel: "whatsapp", phone: "+5511900000003" })
        .select("id")
        .single();
      const { data: agentRow } = await service.from("agents").select("id").eq("slug", "malu").single();
      const { data: conversation } = await service
        .from("conversations")
        .insert({
          company_id: companyId,
          agent_id: (agentRow as { id: string }).id,
          customer_id: (customer as { id: string }).id,
          channel: "whatsapp",
          status: "paused",
        })
        .select("id")
        .single();
      const pausedConversationId = (conversation as { id: string }).id;

      const body = messagingPayload(phoneNumberId, "+5511900000003", "are you there?", "msg-paused-1");
      const res = await postWebhook(body, sign(body));
      expect(res.status).toBe(200);

      // Reused the paused conversation -- not orphaned into a new one.
      const { data: conversations } = await service
        .from("conversations")
        .select("id, status")
        .eq("company_id", companyId);
      expect(conversations).toEqual([{ id: pausedConversationId, status: "paused" }]);

      // Inbound message stored; no agent reply.
      const { data: messages } = await service
        .from("messages")
        .select("role, content")
        .eq("conversation_id", pausedConversationId);
      expect(messages).toEqual([{ role: "customer", content: "are you there?" }]);
    });
  });

  describe("Trello D8 -- coexistence connect", () => {
    it("resolves the phone number from the WABA and marks is_coexistence", async () => {
      const owner = await signUpTestUser("owner");
      const companyId = await createCompany(owner.cookieHeader, "WA Coexistence Connect Co");
      const res = await connectedCoexistenceAgent(owner.cookieHeader, companyId, "malu", "waba-coex-happy-path");
      expect(res.status).toBe(200);
      expect(res.json.connection.phone_number_id).toBe("waba-coex-happy-path-phone");
      expect(res.json.connection.is_coexistence).toBe(true);
    });

    it("502s when the WABA has zero phone numbers", async () => {
      const owner = await signUpTestUser("owner");
      const companyId = await createCompany(owner.cookieHeader, "WA Coexistence Zero Numbers Co");
      const res = await connectedCoexistenceAgent(owner.cookieHeader, companyId, "malu", "trigger-zero-numbers");
      expect(res.status).toBe(502);
    });

    it("502s when the WABA has multiple phone numbers", async () => {
      const owner = await signUpTestUser("owner");
      const companyId = await createCompany(owner.cookieHeader, "WA Coexistence Multiple Numbers Co");
      const res = await connectedCoexistenceAgent(owner.cookieHeader, companyId, "malu", "trigger-multiple-numbers");
      expect(res.status).toBe(502);
    });
  });

  describe("Trello D8 -- message echoes and history backfill", () => {
    it("persists a merchant echo and pauses the conversation", async () => {
      const owner = await signUpTestUser("owner");
      const companyId = await createCompany(owner.cookieHeader, "WA Echo Co");
      const connected = await connectedCoexistenceAgent(owner.cookieHeader, companyId, "malu", "waba-echo-test");
      const phoneNumberId = connected.json.connection.phone_number_id;

      const body = echoPayload(phoneNumberId, "+5511900000010", "já te respondi por aqui!", "echo-msg-1");
      const res = await postWebhook(body, sign(body));
      expect(res.status).toBe(200);

      const { data: customer } = await service
        .from("customers")
        .select("id")
        .eq("company_id", companyId)
        .eq("channel", "whatsapp")
        .eq("phone", "+5511900000010")
        .single();
      const { data: conversation } = await service
        .from("conversations")
        .select("id, status")
        .eq("customer_id", (customer as { id: string }).id)
        .single();
      expect((conversation as { status: string }).status).toBe("paused");

      const { data: messages } = await service
        .from("messages")
        .select("role, content, external_message_id")
        .eq("conversation_id", (conversation as { id: string }).id);
      expect(messages).toEqual([{ role: "merchant", content: "já te respondi por aqui!", external_message_id: "echo-msg-1" }]);
    });

    it("is idempotent: a repeat delivery of the same echo id changes nothing", async () => {
      const owner = await signUpTestUser("owner");
      const companyId = await createCompany(owner.cookieHeader, "WA Echo Idempotent Co");
      const connected = await connectedCoexistenceAgent(owner.cookieHeader, companyId, "malu", "waba-echo-idempotent");
      const phoneNumberId = connected.json.connection.phone_number_id;

      const body = echoPayload(phoneNumberId, "+5511900000011", "primeira vez", "echo-msg-repeat");
      await postWebhook(body, sign(body));
      const res = await postWebhook(body, sign(body));
      expect(res.status).toBe(200);

      const { data: messages } = await service.from("messages").select("id").eq("company_id", companyId);
      expect(messages).toHaveLength(1);
    });

    it("backfills history with correct roles and never touches conversation status or the engine", async () => {
      const owner = await signUpTestUser("owner");
      const companyId = await createCompany(owner.cookieHeader, "WA History Co");
      const connected = await connectedCoexistenceAgent(owner.cookieHeader, companyId, "malu", "waba-history-test");
      const phoneNumberId = connected.json.connection.phone_number_id;
      const customerPhone = "+5511900000012";

      const body = historyPayload(phoneNumberId, customerPhone, [
        { from: customerPhone, text: "oi, vocês têm entrega?", messageId: "history-msg-1" },
        { from: phoneNumberId, text: "sim, entregamos sim!", messageId: "history-msg-2" },
      ]);
      const res = await postWebhook(body, sign(body));
      expect(res.status).toBe(200);

      const { data: customer } = await service
        .from("customers")
        .select("id")
        .eq("company_id", companyId)
        .eq("channel", "whatsapp")
        .eq("phone", customerPhone)
        .single();
      const { data: conversation } = await service
        .from("conversations")
        .select("id, status")
        .eq("customer_id", (customer as { id: string }).id)
        .single();
      // History backfill is sync, not a handoff signal -- status untouched.
      expect((conversation as { status: string }).status).toBe("active");

      const { data: messages } = await service
        .from("messages")
        .select("role, content")
        .eq("conversation_id", (conversation as { id: string }).id)
        .order("created_at", { ascending: true });
      expect(messages).toEqual([
        { role: "customer", content: "oi, vocês têm entrega?" },
        { role: "merchant", content: "sim, entregamos sim!" },
      ]);
    });
  });
});
