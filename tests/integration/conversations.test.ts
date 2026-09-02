import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { api } from "./helpers/request";
import { signUpTestUser } from "./helpers/auth";
import { getTestServiceClient } from "./helpers/service-client";

// Trello F5 -- the merchant-facing Conversations list/detail/reply/resume
// API, tested over real HTTP. Conversations and their messages are seeded
// directly via the service client (same as web-chat.test.ts's rate-limit
// cases) rather than driven through the public chat API, since none of
// this needs a real OpenAI call.
describe("Conversations API", () => {
  async function createCompany(ownerCookie: string, name: string) {
    const created = await api<{ company: { id: string; slug: string } }>(
      "POST",
      "/api/companies",
      ownerCookie,
      { name },
    );
    return created.json.company;
  }

  async function hireMalu(ownerCookie: string, companyId: string) {
    await api("POST", `/api/companies/${companyId}/agents/malu`, ownerCookie, {});
  }

  async function seedConversation(companyId: string, status: "active" | "paused" | "closed" = "active") {
    const svc = getTestServiceClient();
    const { data: agent } = await svc.from("agents").select("id").eq("slug", "malu").single();
    const { data: customer } = await svc
      .from("customers")
      .insert({ company_id: companyId, channel: "web_chat", web_chat_session_id: randomUUID() })
      .select("id")
      .single();
    const { data: conversation } = await svc
      .from("conversations")
      .insert({
        company_id: companyId,
        agent_id: (agent as { id: string }).id,
        customer_id: (customer as { id: string }).id,
        channel: "web_chat",
        status,
      })
      .select("id")
      .single();
    const conversationId = (conversation as { id: string }).id;
    await svc.from("messages").insert([
      { company_id: companyId, conversation_id: conversationId, role: "customer", content: "Hi, is this in stock?" },
      { company_id: companyId, conversation_id: conversationId, role: "agent", content: "Let me check for you!" },
    ]);
    return conversationId;
  }

  // Trello N10 -- a paused Instagram conversation the merchant needs to see
  // and answer. `recipientIgsid` is the customer's IGSID; passing a magic
  // "trigger-send-*" value makes the mock Instagram API fail the outbound
  // send, exercising the delivery-failure path.
  async function seedInstagramConversation(
    companyId: string,
    status: "active" | "paused" | "closed",
    recipientIgsid = "customer-igsid-1",
    lastInboundAgeMs = 0,
  ) {
    const svc = getTestServiceClient();
    const { data: agent } = await svc.from("agents").select("id").eq("slug", "malu").single();
    const agentId = (agent as { id: string }).id;
    const { data: customer } = await svc
      .from("customers")
      .insert({ company_id: companyId, channel: "instagram", instagram_user_id: recipientIgsid })
      .select("id")
      .single();
    const { data: conversation } = await svc
      .from("conversations")
      .insert({
        company_id: companyId,
        agent_id: agentId,
        customer_id: (customer as { id: string }).id,
        channel: "instagram",
        status,
      })
      .select("id")
      .single();
    const conversationId = (conversation as { id: string }).id;
    await svc.from("messages").insert({
      company_id: companyId,
      conversation_id: conversationId,
      role: "customer",
      content: "oi, vcs entregam em SP?",
      // N11: how long ago the customer last wrote decides whether the
      // merchant's reply needs the HUMAN_AGENT tag (>24h) or not.
      created_at: new Date(Date.now() - lastInboundAgeMs).toISOString(),
    });
    // Unique per call -- a partial unique index on instagram_user_id (where
    // status <> 'disconnected') would otherwise collide across the suite's
    // parallel workers.
    await svc.from("company_instagram_connections").insert({
      company_id: companyId,
      agent_id: agentId,
      instagram_user_id: `our-biz-${randomUUID()}`,
      access_token: "mock-token",
      status: "connected",
    });
    return conversationId;
  }

  it("lists only the caller's own company's conversations", async () => {
    const owner = await signUpTestUser("owner");
    const company = await createCompany(owner.cookieHeader, "Conv List Co");
    await hireMalu(owner.cookieHeader, company.id);
    await seedConversation(company.id);

    const otherOwner = await signUpTestUser("owner");
    const otherCompany = await createCompany(otherOwner.cookieHeader, "Conv List Other Co");
    await hireMalu(otherOwner.cookieHeader, otherCompany.id);
    await seedConversation(otherCompany.id);

    const res = await api<{ conversations: { id: string }[]; total: number }>(
      "GET",
      `/api/companies/${company.id}/conversations`,
      owner.cookieHeader,
    );
    expect(res.status).toBe(200);
    expect(res.json.total).toBe(1);
  });

  it("denies a non-member entirely", async () => {
    const owner = await signUpTestUser("owner");
    const company = await createCompany(owner.cookieHeader, "Conv Deny Co");
    await hireMalu(owner.cookieHeader, company.id);
    const conversationId = await seedConversation(company.id);

    const outsider = await signUpTestUser("outsider");
    const listRes = await api("GET", `/api/companies/${company.id}/conversations`, outsider.cookieHeader);
    expect(listRes.status).toBe(403);

    const detailRes = await api(
      "GET",
      `/api/companies/${company.id}/conversations/${conversationId}`,
      outsider.cookieHeader,
    );
    expect(detailRes.status).toBe(403);
  });

  it("returns the full transcript in order on the detail endpoint", async () => {
    const owner = await signUpTestUser("owner");
    const company = await createCompany(owner.cookieHeader, "Conv Detail Co");
    await hireMalu(owner.cookieHeader, company.id);
    const conversationId = await seedConversation(company.id);

    const res = await api<{ messages: { role: string; content: string }[] }>(
      "GET",
      `/api/companies/${company.id}/conversations/${conversationId}`,
      owner.cookieHeader,
    );
    expect(res.status).toBe(200);
    expect(res.json.messages.map((m) => m.role)).toEqual(["customer", "agent"]);
  });

  it("a merchant reply inserts role 'merchant' and flips the conversation to paused", async () => {
    const owner = await signUpTestUser("owner");
    const company = await createCompany(owner.cookieHeader, "Conv Reply Co");
    await hireMalu(owner.cookieHeader, company.id);
    const conversationId = await seedConversation(company.id, "active");

    const res = await api<{ message: { role: string; content: string } }>(
      "POST",
      `/api/companies/${company.id}/conversations/${conversationId}/messages`,
      owner.cookieHeader,
      { message: "I'll take a look and get back to you!" },
    );
    expect(res.status).toBe(201);
    expect(res.json.message.role).toBe("merchant");

    const detail = await api<{ conversation: { status: string } }>(
      "GET",
      `/api/companies/${company.id}/conversations/${conversationId}`,
      owner.cookieHeader,
    );
    expect(detail.json.conversation.status).toBe("paused");
  });

  it("Resume AI sets status back to active", async () => {
    const owner = await signUpTestUser("owner");
    const company = await createCompany(owner.cookieHeader, "Conv Resume Co");
    await hireMalu(owner.cookieHeader, company.id);
    const conversationId = await seedConversation(company.id, "paused");

    const res = await api<{ conversation: { status: string } }>(
      "PATCH",
      `/api/companies/${company.id}/conversations/${conversationId}`,
      owner.cookieHeader,
      { status: "active" },
    );
    expect(res.status).toBe(200);
    expect(res.json.conversation.status).toBe("active");
  });

  it("N10 -- surfaces an Instagram conversation in the list and detail, not just web chat", async () => {
    const owner = await signUpTestUser("owner");
    const company = await createCompany(owner.cookieHeader, "Conv IG Visible Co");
    await hireMalu(owner.cookieHeader, company.id);
    const conversationId = await seedInstagramConversation(company.id, "paused");

    const list = await api<{ conversations: { id: string; channel: string; status: string }[]; total: number }>(
      "GET",
      `/api/companies/${company.id}/conversations?status=paused`,
      owner.cookieHeader,
    );
    expect(list.status).toBe(200);
    expect(list.json.conversations).toHaveLength(1);
    expect(list.json.conversations[0]).toMatchObject({ id: conversationId, channel: "instagram" });

    const detail = await api<{ conversation: { channel: string } }>(
      "GET",
      `/api/companies/${company.id}/conversations/${conversationId}`,
      owner.cookieHeader,
    );
    expect(detail.status).toBe(200);
    expect(detail.json.conversation.channel).toBe("instagram");
  });

  it("N10 -- a merchant reply on an Instagram conversation persists, pauses, and is delivered", async () => {
    const owner = await signUpTestUser("owner");
    const company = await createCompany(owner.cookieHeader, "Conv IG Reply Co");
    await hireMalu(owner.cookieHeader, company.id);
    const conversationId = await seedInstagramConversation(company.id, "active");

    const res = await api<{ message: { role: string }; delivery: { ok: boolean } | null }>(
      "POST",
      `/api/companies/${company.id}/conversations/${conversationId}/messages`,
      owner.cookieHeader,
      { message: "Oi! Entregamos sim, em toda a cidade de São Paulo." },
    );
    expect(res.status).toBe(201);
    expect(res.json.message.role).toBe("merchant");
    expect(res.json.delivery).toEqual({ ok: true });

    const detail = await api<{ conversation: { status: string }; messages: { role: string }[] }>(
      "GET",
      `/api/companies/${company.id}/conversations/${conversationId}`,
      owner.cookieHeader,
    );
    expect(detail.json.conversation.status).toBe("paused");
    expect(detail.json.messages.map((m) => m.role)).toEqual(["customer", "merchant"]);
  });

  it("N10 -- a reply that Instagram rejects is still saved, reports delivery failure, and disconnects a dead token", async () => {
    const owner = await signUpTestUser("owner");
    const company = await createCompany(owner.cookieHeader, "Conv IG Delivery Fail Co");
    await hireMalu(owner.cookieHeader, company.id);
    // "trigger-send-unauthorized" makes the mock Instagram API return 401.
    const conversationId = await seedInstagramConversation(company.id, "paused", "trigger-send-unauthorized");

    const res = await api<{ message: { content: string }; delivery: { ok: boolean } | null }>(
      "POST",
      `/api/companies/${company.id}/conversations/${conversationId}/messages`,
      owner.cookieHeader,
      { message: "resposta fora da janela de 24h" },
    );
    expect(res.status).toBe(201);
    expect(res.json.message.content).toBe("resposta fora da janela de 24h");
    expect(res.json.delivery).toEqual({ ok: false });

    // The reply is never lost even though it didn't reach the customer.
    const detail = await api<{ messages: { role: string; content: string }[] }>(
      "GET",
      `/api/companies/${company.id}/conversations/${conversationId}`,
      owner.cookieHeader,
    );
    expect(detail.json.messages.at(-1)).toMatchObject({ role: "merchant", content: "resposta fora da janela de 24h" });

    // A 401 is treated as the token being dead -- the connection is flipped
    // so N3's card stops claiming it's live.
    const svc = getTestServiceClient();
    const { data: connection } = await svc
      .from("company_instagram_connections")
      .select("status")
      .eq("company_id", company.id)
      .single();
    expect((connection as { status: string }).status).toBe("disconnected");
  });

  it("N11 -- a reply past the 24h window is delivered under the HUMAN_AGENT tag", async () => {
    const owner = await signUpTestUser("owner");
    const company = await createCompany(owner.cookieHeader, "Conv IG N11 Tag Co");
    await hireMalu(owner.cookieHeader, company.id);
    // The mock's "requires-human-agent-tag" recipient 400s unless the send
    // carries messaging_type: MESSAGE_TAG + tag: HUMAN_AGENT. Last inbound
    // is 2 days old -> past 24h, inside 7d -> the route must tag it.
    const conversationId = await seedInstagramConversation(
      company.id,
      "paused",
      "requires-human-agent-tag",
      2 * 24 * 60 * 60 * 1000,
    );

    const res = await api<{ delivery: { ok: boolean } | null }>(
      "POST",
      `/api/companies/${company.id}/conversations/${conversationId}/messages`,
      owner.cookieHeader,
      { message: "Oi! Desculpa a demora — segue a resposta." },
    );
    expect(res.status).toBe(201);
    expect(res.json.delivery).toEqual({ ok: true });
  });

  it("N11 -- a reply inside the 24h window is delivered without the tag", async () => {
    const owner = await signUpTestUser("owner");
    const company = await createCompany(owner.cookieHeader, "Conv IG N11 NoTag Co");
    await hireMalu(owner.cookieHeader, company.id);
    // "rejects-message-tag" 400s if the send carries a message tag. Last
    // inbound is 1 hour old -> inside 24h -> the route must NOT tag it.
    const conversationId = await seedInstagramConversation(
      company.id,
      "active",
      "rejects-message-tag",
      60 * 60 * 1000,
    );

    const res = await api<{ delivery: { ok: boolean } | null }>(
      "POST",
      `/api/companies/${company.id}/conversations/${conversationId}/messages`,
      owner.cookieHeader,
      { message: "resposta rápida dentro da janela" },
    );
    expect(res.status).toBe(201);
    expect(res.json.delivery).toEqual({ ok: true });
  });

  it("rejects an unsupported PATCH status", async () => {
    const owner = await signUpTestUser("owner");
    const company = await createCompany(owner.cookieHeader, "Conv Bad Patch Co");
    await hireMalu(owner.cookieHeader, company.id);
    const conversationId = await seedConversation(company.id, "active");

    const res = await api(
      "PATCH",
      `/api/companies/${company.id}/conversations/${conversationId}`,
      owner.cookieHeader,
      { status: "closed" },
    );
    expect(res.status).toBe(400);
  });
});
