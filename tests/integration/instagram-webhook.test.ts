import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { api } from "./helpers/request";
import { getTestEnv } from "./helpers/env";
import { signUpTestUser } from "./helpers/auth";
import { getTestServiceClient } from "./helpers/service-client";

// Trello N4/N5. The signature is computed with the exact same literal
// INSTAGRAM_APP_SECRET global-setup.ts spawns the test Next.js server with
// -- Instagram Business Login webhooks are signed with the Instagram app
// secret, not META_APP_SECRET (fixed 2026-09-02, see webhook-signature.ts).
// This exercises verifyInstagramSignature's real logic, not a bypass: a
// real Meta caller does the identical HMAC-SHA256 over the identical bytes.
const TEST_APP_SECRET = "test-instagram-app-secret";

function sign(rawBody: string) {
  return `sha256=${createHmac("sha256", TEST_APP_SECRET).update(rawBody).digest("hex")}`;
}

describe("Instagram inbound webhook (GET verify, POST receive)", () => {
  const { baseUrl } = getTestEnv();
  const service = getTestServiceClient();

  async function createCompany(ownerCookie: string, name: string) {
    const created = await api<{ company: { id: string } }>("POST", "/api/companies", ownerCookie, { name });
    return created.json.company.id;
  }

  async function connectedAgent(ownerCookie: string, companyId: string, agentSlug: string, code: string) {
    await api("POST", `/api/companies/${companyId}/agents/${agentSlug}`, ownerCookie);
    const connected = await api<{ connection: { instagram_user_id: string } }>(
      "POST",
      `/api/companies/${companyId}/agents/${agentSlug}/instagram/connect`,
      ownerCookie,
      { code },
    );
    return connected.json.connection.instagram_user_id;
  }

  function messagingPayload(recipientId: string, senderId: string, text: string, mid: string) {
    return JSON.stringify({
      object: "instagram",
      entry: [
        {
          id: recipientId,
          time: Date.now(),
          messaging: [
            {
              sender: { id: senderId },
              recipient: { id: recipientId },
              timestamp: Date.now(),
              message: { mid, text },
            },
          ],
        },
      ],
    });
  }

  async function postWebhook(rawBody: string, signature: string | null) {
    return fetch(`${baseUrl}/api/webhooks/instagram`, {
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
        `${baseUrl}/api/webhooks/instagram?hub.mode=subscribe&hub.challenge=1234567&hub.verify_token=test-instagram-verify-token`,
      );
      expect(res.status).toBe(200);
      expect(await res.text()).toBe("1234567");
    });

    it("403s when the verify token doesn't match", async () => {
      const res = await fetch(
        `${baseUrl}/api/webhooks/instagram?hub.mode=subscribe&hub.challenge=1234567&hub.verify_token=wrong-token`,
      );
      expect(res.status).toBe(403);
    });
  });

  describe("POST signature verification", () => {
    it("403s with no signature header", async () => {
      const body = messagingPayload("irrelevant", "irrelevant", "hi", "mid-no-sig");
      const res = await postWebhook(body, null);
      expect(res.status).toBe(403);
    });

    it("403s with a signature computed from the wrong secret", async () => {
      const body = messagingPayload("irrelevant", "irrelevant", "hi", "mid-bad-sig");
      const badSignature = `sha256=${createHmac("sha256", "not-the-real-secret").update(body).digest("hex")}`;
      const res = await postWebhook(body, badSignature);
      expect(res.status).toBe(403);
    });
  });

  describe("POST with a valid signature", () => {
    it("acks 200 for a webhook naming an account with no live connection", async () => {
      const body = messagingPayload("no-such-account", "some-sender", "hi", "mid-unknown-account");
      const res = await postWebhook(body, sign(body));
      expect(res.status).toBe(200);
    });

    // Regression (found live 2026-09-02): the connect flow used to store the
    // OAuth exchange's app-scoped `user_id` (igid_{code}), but real webhooks
    // arrive under the professional-account id from GET /me?fields=user_id
    // (igsid_{code}). connectedAgent now returns the latter; a webhook
    // addressed to the former must find no connection and stay silent.
    it("does not match a webhook addressed to the OAuth app-scoped id", async () => {
      const owner = await signUpTestUser("owner");
      const companyId = await createCompany(owner.cookieHeader, "Webhook Wrong Id Co");
      const storedId = await connectedAgent(owner.cookieHeader, companyId, "malu", "webhook-wrong-id");
      expect(storedId).toBe("igsid_webhook-wrong-id");

      const body = messagingPayload("igid_webhook-wrong-id", "some-sender", "hi", "mid-wrong-id");
      const res = await postWebhook(body, sign(body));
      expect(res.status).toBe(200);

      const { data: messages } = await service
        .from("messages")
        .select("id")
        .eq("company_id", companyId);
      expect(messages).toHaveLength(0);
    });

    it("is idempotent: a repeat delivery of an already-processed message id changes nothing", async () => {
      const owner = await signUpTestUser("owner");
      const companyId = await createCompany(owner.cookieHeader, "Webhook Idempotent Co");
      const recipientId = await connectedAgent(owner.cookieHeader, companyId, "malu", "webhook-idempotent");

      // Simulates "this message was already handled" directly, the same
      // state the route's own successful first run would leave behind --
      // without needing a real Agent Engine call just to set it up.
      const { data: customer } = await service
        .from("customers")
        .insert({ company_id: companyId, channel: "instagram", instagram_user_id: "sender-idempotent" })
        .select("id")
        .single();
      const { data: agentRow } = await service.from("agents").select("id").eq("slug", "malu").single();
      const { data: conversation } = await service
        .from("conversations")
        .insert({
          company_id: companyId,
          agent_id: (agentRow as { id: string }).id,
          customer_id: (customer as { id: string }).id,
          channel: "instagram",
          status: "active",
        })
        .select("id")
        .single();
      await service.from("messages").insert({
        company_id: companyId,
        conversation_id: (conversation as { id: string }).id,
        role: "customer",
        content: "already handled",
        external_message_id: "mid-repeat",
      });

      const body = messagingPayload(recipientId, "sender-idempotent", "a different retried text", "mid-repeat");
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
    });

    // Trello N4's route calls AgentEngine.run() the same way M3's public chat
    // route does -- with no deps override, so it always uses the real
    // production OpenAI client (unlike agent-engine.test.ts/buying-intent.test.ts,
    // which call AgentEngine.run() directly and inject a fake `openai`). This
    // suite has no real OPENAI_API_KEY configured, so a genuinely new message
    // can't get a real reply here -- same limitation M3's own tests document
    // (architecture.md: "No OpenAI mocking infrastructure added... verified
    // with a manual live smoke test instead"). What IS provable without a key
    // is the same property M3 verified live: the customer's message survives
    // even when the Agent Engine call itself fails.
    it("persists the customer's message even when the Agent Engine call fails", async () => {
      const owner = await signUpTestUser("owner");
      const companyId = await createCompany(owner.cookieHeader, "Webhook New Message Co");
      const recipientId = await connectedAgent(owner.cookieHeader, companyId, "malu", "webhook-new-message");

      const body = messagingPayload(recipientId, "sender-new-message", "Hi, do you have anything nice?", "mid-new-message");
      const res = await postWebhook(body, sign(body));
      expect(res.status).toBe(200); // Meta always gets 200 -- per-item failures are logged, not thrown.

      const { data: customer } = await service
        .from("customers")
        .select("id")
        .eq("company_id", companyId)
        .eq("instagram_user_id", "sender-new-message")
        .single();
      expect(customer).toBeTruthy();

      const { data: messages } = await service
        .from("messages")
        .select("role, content, external_message_id")
        .eq("company_id", companyId);
      const rows = messages as { role: string; content: string; external_message_id: string | null }[];

      expect(rows).toHaveLength(1);
      expect(rows[0].role).toBe("customer");
      expect(rows[0].external_message_id).toBe("mid-new-message");
      expect(rows[0].content).toBe("Hi, do you have anything nice?");
    });

    // Trello N9 -- once C5's request_human has paused a conversation, a human
    // has taken over: the customer's next DM must still be persisted (so that
    // human sees it) but the agent must not reply. Two things have to hold
    // for this to work: resolveInstagramSession must *reuse* the paused
    // conversation rather than orphan it into a fresh 'active' one, and the
    // webhook must then skip the engine on 'paused'. No OpenAI key needed --
    // the gate short-circuits before AgentEngine.run().
    it("stays silent on a paused conversation but still persists the inbound message", async () => {
      const owner = await signUpTestUser("owner");
      const companyId = await createCompany(owner.cookieHeader, "Webhook Paused Co");
      const recipientId = await connectedAgent(owner.cookieHeader, companyId, "malu", "webhook-paused");

      const { data: customer } = await service
        .from("customers")
        .insert({ company_id: companyId, channel: "instagram", instagram_user_id: "sender-paused" })
        .select("id")
        .single();
      const { data: agentRow } = await service.from("agents").select("id").eq("slug", "malu").single();
      const { data: conversation } = await service
        .from("conversations")
        .insert({
          company_id: companyId,
          agent_id: (agentRow as { id: string }).id,
          customer_id: (customer as { id: string }).id,
          channel: "instagram",
          status: "paused",
        })
        .select("id")
        .single();
      const pausedConversationId = (conversation as { id: string }).id;

      const body = messagingPayload(recipientId, "sender-paused", "are you there?", "mid-paused-1");
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
});
