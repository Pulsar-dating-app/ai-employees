import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { api } from "./helpers/request";
import { signUpTestUser, type TestUser } from "./helpers/auth";
import { getTestServiceClient } from "./helpers/service-client";
import { getTestEnv } from "./helpers/env";
import { seedActivePlan } from "./helpers/billing";

// funnel_events (2026-10-26) is insert-only for merchants, as themselves,
// into their own company; only the service role reads it.
describe("Funnel events", () => {
  async function createCompany(user: TestUser) {
    const created = await api<{ company: { id: string } }>("POST", "/api/companies", user.cookieHeader, {
      name: `Funnel Co ${randomUUID().slice(0, 8)}`,
    });
    return created.json.company.id;
  }

  async function eventsFor(companyId: string) {
    const { data } = await getTestServiceClient()
      .from("funnel_events")
      .select("event, properties, user_id")
      .eq("company_id", companyId);
    return (data ?? []) as { event: string; properties: Record<string, unknown>; user_id: string }[];
  }

  it("lets a member record an event for their own company, and nothing else", async () => {
    const [owner, stranger] = await Promise.all([signUpTestUser("funnel-owner"), signUpTestUser("funnel-stranger")]);
    const companyId = await createCompany(owner);

    const own = await owner.client
      .from("funnel_events")
      .insert({ company_id: companyId, user_id: owner.userId, event: "link_copied", properties: { surface: "home" } });
    expect(own.error).toBeNull();

    // Into someone else's company, or as someone else: refused by RLS.
    const foreign = await stranger.client
      .from("funnel_events")
      .insert({ company_id: companyId, user_id: stranger.userId, event: "link_copied" });
    expect(foreign.error?.code).toBe("42501");
    const impersonated = await stranger.client
      .from("funnel_events")
      .insert({ company_id: null, user_id: owner.userId, event: "app_opened" });
    expect(impersonated.error?.code).toBe("42501");

    // Nobody reads it back through the API.
    const read = await owner.client.from("funnel_events").select("event").eq("company_id", companyId);
    expect(read.data ?? []).toHaveLength(0);

    expect(await eventsFor(companyId)).toEqual([
      { event: "link_copied", properties: { surface: "home" }, user_id: owner.userId },
    ]);
  });

  it("records a nudge e-mail click and forwards to the dashboard", async () => {
    const owner = await signUpTestUser("funnel-click");
    const companyId = await createCompany(owner);
    const { baseUrl } = getTestEnv();

    const res = await fetch(`${baseUrl}/api/nudges/click?k=not_live`, {
      headers: { cookie: owner.cookieHeader },
      redirect: "manual",
    });
    expect(res.status).toBe(307);
    expect(new URL(res.headers.get("location")!, baseUrl).pathname).toBe("/dashboard");
    expect(await eventsFor(companyId)).toEqual([
      { event: "nudge_clicked", properties: { kind: "not_live" }, user_id: owner.userId },
    ]);

    // An unknown kind is forwarded without recording anything.
    await fetch(`${baseUrl}/api/nudges/click?k=bogus`, { headers: { cookie: owner.cookieHeader }, redirect: "manual" });
    expect(await eventsFor(companyId)).toHaveLength(1);
  });
});

describe("Activation funnel events written by the database", () => {
  const service = getTestServiceClient();

  async function hiredCompany() {
    const owner = await signUpTestUser("funnel-activation");
    const created = await api<{ company: { id: string } }>("POST", "/api/companies", owner.cookieHeader, {
      name: `Activation Co ${randomUUID().slice(0, 8)}`,
    });
    const companyId = created.json.company.id;
    await seedActivePlan(companyId);
    await api("POST", `/api/companies/${companyId}/agents/ana`, owner.cookieHeader);
    const { data: agent } = await service.from("agents").select("id").eq("slug", "ana").single();
    return { owner, companyId, agentId: (agent as { id: string }).id };
  }

  async function activationEvents(companyId: string) {
    const { data } = await service
      .from("funnel_events")
      .select("event, properties, user_id")
      .eq("company_id", companyId)
      .in("event", ["channel_connected", "first_customer_conversation"])
      .order("created_at");
    return (data ?? []) as { event: string; properties: Record<string, unknown>; user_id: string }[];
  }

  async function conversation(companyId: string, agentId: string, channel: string, isPreview = false) {
    const { data: customer } = await service
      .from("customers")
      .insert({ company_id: companyId, channel: "web_chat", web_chat_session_id: randomUUID() })
      .select("id")
      .single();
    const { data } = await service
      .from("conversations")
      .insert({
        company_id: companyId,
        agent_id: agentId,
        customer_id: (customer as { id: string }).id,
        channel,
        status: "active",
        is_preview: isPreview,
      })
      .select("id")
      .single();
    return (data as { id: string }).id;
  }

  async function say(companyId: string, conversationId: string, role: "customer" | "agent") {
    const { error } = await service
      .from("messages")
      .insert({ company_id: companyId, conversation_id: conversationId, role, content: "oi" });
    expect(error).toBeNull();
  }

  it("records each channel becoming connected, once per transition, for the owner", async () => {
    const { owner, companyId, agentId } = await hiredCompany();

    const { data: wa } = await service
      .from("company_whatsapp_connections")
      .insert({
        company_id: companyId,
        agent_id: agentId,
        phone_number_id: `phone-${randomUUID()}`,
        waba_id: `waba-${randomUUID()}`,
        access_token: "mock-token",
        status: "pending",
      })
      .select("id")
      .single();
    expect(await activationEvents(companyId)).toEqual([]);

    const waId = (wa as { id: string }).id;
    await service.from("company_whatsapp_connections").update({ status: "connected" }).eq("id", waId);
    await service.from("company_whatsapp_connections").update({ status: "connected" }).eq("id", waId);

    await service.from("company_instagram_connections").insert({
      company_id: companyId,
      agent_id: agentId,
      instagram_user_id: `funnel-${randomUUID()}`,
      access_token: "mock-token",
      status: "connected",
    });

    expect(await activationEvents(companyId)).toEqual([
      { event: "channel_connected", properties: { channel: "whatsapp" }, user_id: owner.userId },
      { event: "channel_connected", properties: { channel: "instagram" }, user_id: owner.userId },
    ]);
  });

  it("records the first real customer message once, ignoring the onboarding rehearsal", async () => {
    const { owner, companyId, agentId } = await hiredCompany();

    const preview = await conversation(companyId, agentId, "web_chat", true);
    await say(companyId, preview, "customer");
    expect(await activationEvents(companyId)).toEqual([]);

    const real = await conversation(companyId, agentId, "web_chat");
    await say(companyId, real, "agent");
    expect(await activationEvents(companyId)).toEqual([]);

    await say(companyId, real, "customer");
    const later = await conversation(companyId, agentId, "instagram");
    await say(companyId, later, "customer");

    expect(await activationEvents(companyId)).toEqual([
      { event: "first_customer_conversation", properties: { channel: "web_chat" }, user_id: owner.userId },
    ]);
  });
});
