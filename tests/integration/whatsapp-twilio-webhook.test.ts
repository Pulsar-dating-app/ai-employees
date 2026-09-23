import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { api } from "./helpers/request";
import { getTestEnv } from "./helpers/env";
import { signUpTestUser } from "./helpers/auth";
import { seedActivePlan } from "./helpers/billing";
import { getTestServiceClient } from "./helpers/service-client";
import { computeTwilioSignature } from "@/lib/whatsapp/twilio/signature";
import { decryptSecret } from "@/lib/whatsapp/twilio/crypto";

// Twilio's inbound WhatsApp webhook and status callback. Requests are signed
// the way Twilio signs them (HMAC-SHA1 over URL + sorted params, keyed with
// the company's subaccount Auth Token), using the token the connect route
// actually stored.
//
// The webhook acknowledges immediately and runs the reply pipeline in
// `after()`, so "what happened" assertions poll the database. As in
// whatsapp-webhook.test.ts, this suite has no real OpenAI key: a new message
// can't get a real reply, but the customer's message surviving a failing
// Agent Engine is provable -- and so is every gate that stops before it.
process.env.TWILIO_CREDENTIALS_KEY = "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY="; // same literal as global-setup.ts

describe("Twilio WhatsApp inbound webhook", () => {
  const { baseUrl } = getTestEnv();
  const service = getTestServiceClient();

  async function createCompany(ownerCookie: string, name: string) {
    const created = await api<{ company: { id: string } }>("POST", "/api/companies", ownerCookie, { name });
    return created.json.company.id;
  }

  function uniquePhone() {
    return `+55118${String(Math.floor(Math.random() * 1e8)).padStart(8, "0")}`;
  }

  // Connects a real number through the connect route (so the company's
  // subaccount + encrypted token exist exactly as in production) and returns
  // the pieces a webhook call needs.
  async function connectedCompany(name: string, opts: { planKey?: string; online?: boolean } = {}) {
    const owner = await signUpTestUser("owner");
    const companyId = await createCompany(owner.cookieHeader, name);
    await seedActivePlan(companyId, { planKey: opts.planKey ?? "starter_wpp" });
    await api("POST", `/api/companies/${companyId}/agents/malu`, owner.cookieHeader);

    const phone = uniquePhone();
    const connected = await api<{ connection: { status: string } }>(
      "POST",
      `/api/companies/${companyId}/agents/malu/whatsapp/twilio/connect`,
      owner.cookieHeader,
      {
        wabaId: `waba-${randomUUID().slice(0, 8)}`,
        phoneNumber: phone,
        displayName: opts.online === false ? "Loja" : "trigger-online",
      },
    );
    expect(connected.status).toBe(200);

    const { data: account } = await service
      .from("company_twilio_accounts")
      .select("auth_token_encrypted")
      .eq("company_id", companyId)
      .single();
    const { data: agent } = await service.from("agents").select("id").eq("slug", "malu").single();
    return {
      owner,
      companyId,
      phone,
      agentId: (agent as { id: string }).id,
      authToken: decryptSecret(account!.auth_token_encrypted as string),
    };
  }

  function inboundParams(phone: string, customerPhone: string, body: string, sid: string): [string, string][] {
    return [
      ["MessageSid", sid],
      ["AccountSid", "ACwhatever"],
      ["From", `whatsapp:${customerPhone}`],
      ["To", `whatsapp:${phone}`],
      ["Body", body],
      ["NumMedia", "0"],
    ];
  }

  async function post(companyId: string, authToken: string | null, params: [string, string][], suffix = "") {
    const url = `${baseUrl}/api/webhooks/twilio/whatsapp/${companyId}${suffix}`;
    return fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        ...(authToken ? { "x-twilio-signature": computeTwilioSignature(url, params, authToken) } : {}),
      },
      body: new URLSearchParams(params),
    });
  }

  async function waitFor<T>(read: () => Promise<T>, done: (value: T) => boolean, timeoutMs = 8000): Promise<T> {
    const deadline = Date.now() + timeoutMs;
    let value = await read();
    while (!done(value) && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 200));
      value = await read();
    }
    return value;
  }

  const settle = () => new Promise((resolve) => setTimeout(resolve, 1500));

  async function messagesOf(companyId: string) {
    const { data } = await service
      .from("messages")
      .select("role, content, external_message_id, conversation_id")
      .eq("company_id", companyId);
    return (data ?? []) as { role: string; content: string; external_message_id: string | null; conversation_id: string }[];
  }

  describe("signature verification", () => {
    it("403s with no signature, a wrong-token signature, and an unknown company", async () => {
      const { companyId, phone, authToken } = await connectedCompany("Twilio Webhook Sig Co");
      const params = inboundParams(phone, "+5511977770001", "hi", "SMsig0001");

      expect((await post(companyId, null, params)).status).toBe(403);
      expect((await post(companyId, "not-the-real-token", params)).status).toBe(403);
      // Same answer for a company that doesn't exist -- no enumeration.
      expect((await post(randomUUID(), authToken, params)).status).toBe(403);
      // A signature over a *different* body is not accepted for this one.
      const url = `${baseUrl}/api/webhooks/twilio/whatsapp/${companyId}`;
      const tampered = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          "x-twilio-signature": computeTwilioSignature(url, params, authToken),
        },
        body: new URLSearchParams(inboundParams(phone, "+5511977770001", "tampered", "SMsig0001")),
      });
      expect(tampered.status).toBe(403);
      expect(await messagesOf(companyId)).toHaveLength(0);
    });

    it("one company's token doesn't validate another company's webhook", async () => {
      const a = await connectedCompany("Twilio Webhook Cross A Co");
      const b = await connectedCompany("Twilio Webhook Cross B Co");
      const res = await post(b.companyId, a.authToken, inboundParams(b.phone, "+5511977770002", "hi", "SMcross01"));
      expect(res.status).toBe(403);
    });
  });

  describe("valid signature", () => {
    it("acknowledges immediately with an empty TwiML response (so Twilio sends no auto-reply)", async () => {
      const { companyId, phone, authToken } = await connectedCompany("Twilio Webhook Ack Co");
      const res = await post(companyId, authToken, inboundParams(phone, "+5511977770003", "hi", "SMack0001"));
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("text/xml");
      expect(await res.text()).toContain("<Response></Response>");
    });

    it("persists the customer's message (phone stored digits-only) even when the Agent Engine call fails", async () => {
      const { companyId, phone, authToken } = await connectedCompany("Twilio Webhook New Message Co");
      const res = await post(companyId, authToken, inboundParams(phone, "+5511977770004", "Oi, tem algo bonito?", "SMnew0001"));
      expect(res.status).toBe(200);

      const rows = await waitFor(() => messagesOf(companyId), (r) => r.length >= 1);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ role: "customer", content: "Oi, tem algo bonito?", external_message_id: "SMnew0001" });

      const { data: customer } = await service
        .from("customers")
        .select("phone, channel")
        .eq("company_id", companyId)
        .single();
      expect(customer).toMatchObject({ phone: "5511977770004", channel: "whatsapp" });
    });

    it("is idempotent on MessageSid: a Twilio retry of a handled message changes nothing", async () => {
      const { companyId, phone, authToken } = await connectedCompany("Twilio Webhook Idempotent Co");
      const params = inboundParams(phone, "+5511977770005", "primeira", "SMidem0001");
      await post(companyId, authToken, params);
      await waitFor(() => messagesOf(companyId), (r) => r.length >= 1);
      await settle(); // let the first pipeline finish (its failing Agent Engine call) before the retry

      const before = (await messagesOf(companyId)).length;
      const retry = await post(companyId, authToken, inboundParams(phone, "+5511977770005", "texto diferente", "SMidem0001"));
      expect(retry.status).toBe(200);
      await settle();

      const after = await messagesOf(companyId);
      expect(after).toHaveLength(before);
      expect(after.some((m) => m.content === "texto diferente")).toBe(false);
    });

    it("acks and drops media-only messages and numbers with no live connection", async () => {
      const { companyId, phone, authToken } = await connectedCompany("Twilio Webhook Drop Co");

      const media = await post(companyId, authToken, [
        ["MessageSid", "SMmedia001"],
        ["From", "whatsapp:+5511977770006"],
        ["To", `whatsapp:${phone}`],
        ["Body", ""],
        ["NumMedia", "1"],
        ["MediaUrl0", "https://api.twilio.com/media/1"],
      ]);
      expect(media.status).toBe(200);

      const unknownNumber = await post(companyId, authToken, inboundParams("+5511900000000", "+5511977770006", "hi", "SMunk00001"));
      expect(unknownNumber.status).toBe(200);

      await settle();
      expect(await messagesOf(companyId)).toHaveLength(0);
    });

    it("promotes a pending sender to connected when a message proves it is live", async () => {
      const { companyId, phone, authToken } = await connectedCompany("Twilio Webhook Promote Co", { online: false });
      const before = await service.from("company_whatsapp_connections").select("status").eq("company_id", companyId).single();
      expect(before.data!.status).toBe("pending");

      await post(companyId, authToken, inboundParams(phone, "+5511977770007", "oi", "SMpromote01"));
      const row = await waitFor(
        async () => (await service.from("company_whatsapp_connections").select("status, sender_status").eq("company_id", companyId).single()).data,
        (r) => r?.status === "connected",
      );
      expect(row).toMatchObject({ status: "connected", sender_status: "ONLINE" });
      expect((await waitFor(() => messagesOf(companyId), (r) => r.length >= 1))).toHaveLength(1);
    });

    it("ignores a disconnected number entirely", async () => {
      const { companyId, phone, authToken, owner } = await connectedCompany("Twilio Webhook Disconnected Co");
      await api("DELETE", `/api/companies/${companyId}/agents/malu/whatsapp`, owner.cookieHeader);

      const res = await post(companyId, authToken, inboundParams(phone, "+5511977770008", "hello?", "SMdisc00001"));
      expect(res.status).toBe(200);
      await settle();
      expect(await messagesOf(companyId)).toHaveLength(0);
    });

    it("skips everything (persists nothing) once the plan no longer includes the WhatsApp add-on", async () => {
      const { companyId, phone, authToken } = await connectedCompany("Twilio Webhook Downgraded Co");
      await service.from("company_billing").update({ plan_key: "starter" }).eq("company_id", companyId);

      const res = await post(companyId, authToken, inboundParams(phone, "+5511977770009", "oi", "SMdown00001"));
      expect(res.status).toBe(200);
      await settle();
      expect(await messagesOf(companyId)).toHaveLength(0);
    });

    it("stays silent on a paused conversation but still persists the inbound message", async () => {
      const { companyId, phone, authToken, agentId } = await connectedCompany("Twilio Webhook Paused Co");
      const customerPhone = "5511977770010";
      const { data: customer } = await service
        .from("customers")
        .insert({ company_id: companyId, channel: "whatsapp", phone: customerPhone })
        .select("id")
        .single();
      const { data: conversation } = await service
        .from("conversations")
        .insert({ company_id: companyId, agent_id: agentId, customer_id: (customer as { id: string }).id, channel: "whatsapp", status: "paused" })
        .select("id")
        .single();

      await post(companyId, authToken, inboundParams(phone, `+${customerPhone}`, "tem alguem ai?", "SMpaused001"));
      const rows = await waitFor(() => messagesOf(companyId), (r) => r.length >= 1);
      await settle();

      const all = await messagesOf(companyId);
      expect(all).toHaveLength(1);
      expect(all[0]).toMatchObject({ role: "customer", conversation_id: (conversation as { id: string }).id });
      expect(rows[0].content).toBe("tem alguem ai?");
      const { data: convs } = await service.from("conversations").select("id").eq("company_id", companyId);
      expect(convs).toHaveLength(1); // reused, not orphaned into a new one
    });
  });

  describe("status callback", () => {
    it("requires a valid signature, and accepts a signed delivery-failure report", async () => {
      const { companyId, authToken } = await connectedCompany("Twilio Status Callback Co");
      const params: [string, string][] = [
        ["MessageSid", "SMstatus001"],
        ["MessageStatus", "undelivered"],
        ["ErrorCode", "63024"],
      ];
      expect((await post(companyId, null, params, "/status")).status).toBe(403);
      expect((await post(companyId, "wrong-token", params, "/status")).status).toBe(403);
      expect((await post(companyId, authToken, params, "/status")).status).toBe(200);
    });
  });
});
