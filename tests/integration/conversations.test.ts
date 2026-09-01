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
