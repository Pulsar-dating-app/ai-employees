import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { api } from "./helpers/request";
import { getTestEnv } from "./helpers/env";
import { signUpTestUser } from "./helpers/auth";
import { getTestServiceClient } from "./helpers/service-client";
import { seedActivePlan } from "./helpers/billing";
import type { SentTwilioMessage } from "./helpers/twilio-api-mock";
import { computeTwilioSignature } from "@/lib/whatsapp/twilio-signature";

const WEBHOOK_PATH = "/api/webhooks/twilio/whatsapp";
const SENDER_ID = "whatsapp:+5511912345678";

describe("Twilio WhatsApp inbound webhook (POST /api/webhooks/twilio/whatsapp)", () => {
  const { baseUrl, twilioApiMockUrl } = getTestEnv();
  const service = getTestServiceClient();

  async function connectedCompany(name: string, wabaId = `waba-${randomUUID().slice(0, 8)}`) {
    const owner = await signUpTestUser("owner");
    const created = await api<{ company: { id: string } }>("POST", "/api/companies", owner.cookieHeader, { name });
    const companyId = created.json.company.id;
    await seedActivePlan(companyId, { planKey: "starter_wpp" });
    await api("POST", `/api/companies/${companyId}/agents/malu`, owner.cookieHeader);
    const connected = await api("POST", `/api/companies/${companyId}/agents/malu/whatsapp/connect`, owner.cookieHeader, {
      code: "good-code",
      phoneNumberId: `phone-${randomUUID().slice(0, 8)}`,
      wabaId,
    });
    expect(connected.status).toBe(200);

    const { data: account } = await service
      .from("company_twilio_accounts")
      .select("account_sid, auth_token")
      .eq("company_id", companyId)
      .single();
    const { account_sid: accountSid, auth_token: authToken } = account as { account_sid: string; auth_token: string };
    return { owner, companyId, accountSid, authToken };
  }

  function inboundParams(accountSid: string, waId: string, text: string, messageSid: string, to = SENDER_ID) {
    return new URLSearchParams({
      AccountSid: accountSid,
      MessageSid: messageSid,
      From: `whatsapp:+${waId}`,
      To: to,
      Body: text,
      WaId: waId,
      ProfileName: "Cliente",
      NumMedia: "0",
    });
  }

  async function postWebhook(params: URLSearchParams, authToken: string | null) {
    const signature = authToken ? computeTwilioSignature(`${baseUrl}${WEBHOOK_PATH}`, params, authToken) : null;
    return fetch(`${baseUrl}${WEBHOOK_PATH}`, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        ...(signature ? { "x-twilio-signature": signature } : {}),
      },
      body: params.toString(),
    });
  }

  async function companyMessages(companyId: string) {
    const { data } = await service
      .from("messages")
      .select("role, content, external_message_id")
      .eq("company_id", companyId)
      .order("created_at", { ascending: true });
    return data as { role: string; content: string; external_message_id: string | null }[];
  }

  it("403s without a signature, with the wrong token, or for an unknown account", async () => {
    const { accountSid, authToken } = await connectedCompany("Twilio Sig Co");
    const params = inboundParams(accountSid, "5511900000101", "oi", "SMsig");

    expect((await postWebhook(params, null)).status).toBe(403);
    expect((await postWebhook(params, `${authToken}-wrong`)).status).toBe(403);

    const unknown = inboundParams("ACunknown", "5511900000101", "oi", "SMsig-unknown");
    expect((await postWebhook(unknown, authToken)).status).toBe(403);
  });

  it("persists the customer's message keyed by WaId even when the Agent Engine fails", async () => {
    const { companyId, accountSid, authToken } = await connectedCompany("Twilio Inbound Co");
    const res = await postWebhook(inboundParams(accountSid, "5511900000102", "Vocês têm entrega?", "SMinbound"), authToken);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/xml");

    const { data: customer } = await service
      .from("customers")
      .select("id")
      .eq("company_id", companyId)
      .eq("channel", "whatsapp")
      .eq("phone", "5511900000102")
      .single();
    expect(customer).toBeTruthy();

    expect(await companyMessages(companyId)).toEqual([
      { role: "customer", content: "Vocês têm entrega?", external_message_id: "SMinbound" },
    ]);
  });

  it("is idempotent on a repeat MessageSid", async () => {
    const { companyId, accountSid, authToken } = await connectedCompany("Twilio Idempotent Co");
    const params = inboundParams(accountSid, "5511900000103", "primeira", "SMrepeat");
    await postWebhook(params, authToken);
    const res = await postWebhook(params, authToken);
    expect(res.status).toBe(200);
    expect(await companyMessages(companyId)).toHaveLength(1);
  });

  it("never routes a message to another company's connection, even with a valid signature", async () => {
    const victim = await connectedCompany("Twilio Victim Co");
    const attacker = await connectedCompany("Twilio Attacker Co");
    await service.from("company_whatsapp_connections").delete().eq("company_id", attacker.companyId);

    const res = await postWebhook(
      inboundParams(attacker.accountSid, "5511900000104", "spoof", "SMspoof"),
      attacker.authToken,
    );
    expect(res.status).toBe(200);
    expect(await companyMessages(victim.companyId)).toEqual([]);
    expect(await companyMessages(attacker.companyId)).toEqual([]);
  });

  it("ignores messages while the sender is still pending", async () => {
    const { companyId, accountSid, authToken } = await connectedCompany(
      "Twilio Pending Co",
      `trigger-sender-creating-${randomUUID().slice(0, 8)}`,
    );
    const res = await postWebhook(inboundParams(accountSid, "5511900000105", "oi", "SMpending"), authToken);
    expect(res.status).toBe(200);
    expect(await companyMessages(companyId)).toEqual([]);
  });

  it("delivers a merchant's manual reply through Twilio from the company's subaccount", async () => {
    const { owner, companyId, accountSid, authToken } = await connectedCompany("Twilio Manual Reply Co");
    await postWebhook(inboundParams(accountSid, "5511900000106", "quero falar com alguém", "SMhandoff"), authToken);

    const { data: conversation } = await service
      .from("conversations")
      .select("id")
      .eq("company_id", companyId)
      .single();
    const reply = await api<{ delivery: { ok: boolean } }>(
      "POST",
      `/api/companies/${companyId}/conversations/${(conversation as { id: string }).id}/messages`,
      owner.cookieHeader,
      { message: "Oi! Aqui é a equipe." },
    );
    expect(reply.status).toBe(201);
    expect(reply.json.delivery.ok).toBe(true);

    const sent = (await (
      await fetch(`${twilioApiMockUrl}/__sent?to=${encodeURIComponent("whatsapp:+5511900000106")}`)
    ).json()) as SentTwilioMessage[];
    expect(sent).toEqual([
      { accountSid, from: SENDER_ID, to: "whatsapp:+5511900000106", body: "Oi! Aqui é a equipe." },
    ]);
  });
});
