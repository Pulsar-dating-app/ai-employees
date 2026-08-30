import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { api } from "./helpers/request";
import { signUpTestUser } from "./helpers/auth";
import { getTestEnv } from "./helpers/env";
import { getTestServiceClient } from "./helpers/service-client";

// Trello M3 -- the public chat API, tested over real HTTP. Every case here
// short-circuits before AgentEngine.run() would ever be called (auth,
// validation, rate limiting), so none of it needs a real OpenAI call or any
// mocking of one -- the one path that does (a real reply coming back) is
// verified with a manual live smoke test instead, not here. Rate-limit
// cases seed state directly via the service client rather than making many
// real POSTs, for the same "no real LLM calls in the automated suite"
// reason.
describe("Public chat API GET/POST /api/chat/:companySlug/:agentSlug", () => {
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

  async function countMessages(conversationId: string) {
    const { count } = await getTestServiceClient()
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("conversation_id", conversationId);
    return count ?? 0;
  }

  it("404s for an unknown company slug", async () => {
    const res = await api("GET", `/api/chat/no-such-company-${randomUUID()}/malu?sessionId=${randomUUID()}`);
    expect(res.status).toBe(404);
  });

  it("404s for an unknown agent slug", async () => {
    const owner = await signUpTestUser("owner");
    const company = await createCompany(owner.cookieHeader, "Unknown Agent Chat Co");
    const res = await api("GET", `/api/chat/${company.slug}/no-such-agent?sessionId=${randomUUID()}`);
    expect(res.status).toBe(404);
  });

  it("403s when the agent hasn't been hired", async () => {
    const owner = await signUpTestUser("owner");
    const company = await createCompany(owner.cookieHeader, "Not Hired Chat Co");
    const res = await api("POST", `/api/chat/${company.slug}/malu`, undefined, {
      sessionId: randomUUID(),
      message: "Hi",
    });
    expect(res.status).toBe(403);
  });

  it("403s when the agent is hired but paused", async () => {
    const owner = await signUpTestUser("owner");
    const company = await createCompany(owner.cookieHeader, "Paused Agent Chat Co");
    await hireMalu(owner.cookieHeader, company.id);
    await getTestServiceClient()
      .from("company_agents")
      .update({ status: "paused" })
      .eq("company_id", company.id);

    const res = await api("POST", `/api/chat/${company.slug}/malu`, undefined, {
      sessionId: randomUUID(),
      message: "Hi",
    });
    expect(res.status).toBe(403);
  });

  it("rejects a malformed or missing sessionId", async () => {
    const owner = await signUpTestUser("owner");
    const company = await createCompany(owner.cookieHeader, "Bad Session Chat Co");
    await hireMalu(owner.cookieHeader, company.id);

    const missing = await api("POST", `/api/chat/${company.slug}/malu`, undefined, { message: "Hi" });
    expect(missing.status).toBe(400);

    const malformed = await api("POST", `/api/chat/${company.slug}/malu`, undefined, {
      sessionId: "not-a-uuid",
      message: "Hi",
    });
    expect(malformed.status).toBe(400);
  });

  it("rejects an empty or missing message", async () => {
    const owner = await signUpTestUser("owner");
    const company = await createCompany(owner.cookieHeader, "Bad Message Chat Co");
    await hireMalu(owner.cookieHeader, company.id);
    const sessionId = randomUUID();

    const missing = await api("POST", `/api/chat/${company.slug}/malu`, undefined, { sessionId });
    expect(missing.status).toBe(400);

    const empty = await api("POST", `/api/chat/${company.slug}/malu`, undefined, { sessionId, message: "   " });
    expect(empty.status).toBe(400);
  });

  it("403s an embedded request whose origin isn't on the allowlist (empty list blocks everything)", async () => {
    const owner = await signUpTestUser("owner");
    const company = await createCompany(owner.cookieHeader, "Domain Blocked Chat Co");
    await hireMalu(owner.cookieHeader, company.id);

    const res = await api("POST", `/api/chat/${company.slug}/malu`, undefined, {
      sessionId: randomUUID(),
      message: "Hi",
      embeddedOn: "https://unrelated-site.example/page",
    });
    expect(res.status).toBe(403);
  });

  it("returns an empty history for a brand-new session, not an error", async () => {
    const owner = await signUpTestUser("owner");
    const company = await createCompany(owner.cookieHeader, "Fresh Session Chat Co");
    await hireMalu(owner.cookieHeader, company.id);

    const res = await api<{ messages: unknown[] }>(
      "GET",
      `/api/chat/${company.slug}/malu?sessionId=${randomUUID()}`,
    );
    expect(res.status).toBe(200);
    expect(res.json.messages).toEqual([]);
  });

  it("429s once the per-conversation rolling-window rate limit is tripped, without reaching the Agent Engine", async () => {
    const owner = await signUpTestUser("owner");
    const company = await createCompany(owner.cookieHeader, "Conversation Rate Limit Co");
    await hireMalu(owner.cookieHeader, company.id);

    const { data: agent } = await getTestServiceClient().from("agents").select("id").eq("slug", "malu").single();
    const sessionId = randomUUID();
    const svc = getTestServiceClient();

    const { data: customer } = await svc
      .from("customers")
      .insert({ company_id: company.id, channel: "web_chat", web_chat_session_id: sessionId })
      .select("id")
      .single();
    const { data: conversation } = await svc
      .from("conversations")
      .insert({ company_id: company.id, agent_id: (agent as { id: string }).id, customer_id: (customer as { id: string }).id, channel: "web_chat", status: "active" })
      .select("id")
      .single();
    const conversationId = (conversation as { id: string }).id;

    // 10 recent customer messages -- exactly the rolling-window threshold.
    const recentRows = Array.from({ length: 10 }, () => ({
      company_id: company.id,
      conversation_id: conversationId,
      role: "customer" as const,
      content: "spam",
    }));
    await svc.from("messages").insert(recentRows);

    const before = await countMessages(conversationId);

    const res = await api("POST", `/api/chat/${company.slug}/malu`, undefined, { sessionId, message: "One more?" });
    expect(res.status).toBe(429);

    // The rejected attempt must not have written a new message row itself.
    expect(await countMessages(conversationId)).toBe(before);
  });

  it("429s once the per-conversation hard cap is tripped, isolated from the rolling window", async () => {
    const owner = await signUpTestUser("owner");
    const company = await createCompany(owner.cookieHeader, "Conversation Hard Cap Co");
    await hireMalu(owner.cookieHeader, company.id);

    const { data: agent } = await getTestServiceClient().from("agents").select("id").eq("slug", "malu").single();
    const sessionId = randomUUID();
    const svc = getTestServiceClient();

    const { data: customer } = await svc
      .from("customers")
      .insert({ company_id: company.id, channel: "web_chat", web_chat_session_id: sessionId })
      .select("id")
      .single();
    const { data: conversation } = await svc
      .from("conversations")
      .insert({ company_id: company.id, agent_id: (agent as { id: string }).id, customer_id: (customer as { id: string }).id, channel: "web_chat", status: "active" })
      .select("id")
      .single();
    const conversationId = (conversation as { id: string }).id;

    // 200 old customer messages (outside the 60s rolling window, so only
    // the hard cap -- not the rolling-window check -- can be what trips).
    const oldTimestamp = new Date(Date.now() - 10 * 60_000).toISOString();
    const oldRows = Array.from({ length: 200 }, () => ({
      company_id: company.id,
      conversation_id: conversationId,
      role: "customer" as const,
      content: "old",
      created_at: oldTimestamp,
    }));
    await svc.from("messages").insert(oldRows);

    const res = await api("POST", `/api/chat/${company.slug}/malu`, undefined, { sessionId, message: "One more?" });
    expect(res.status).toBe(429);
    const body = res.json as { error: string };
    expect(body.error).toMatch(/message limit/i);
  });

  it("429s once the per-IP rolling-window rate limit is tripped", async () => {
    const owner = await signUpTestUser("owner");
    const company = await createCompany(owner.cookieHeader, "IP Rate Limit Co");
    await hireMalu(owner.cookieHeader, company.id);

    const ip = `203.0.113.${Math.floor(Math.random() * 254) + 1}`;
    const svc = getTestServiceClient();
    const rows = Array.from({ length: 20 }, () => ({ ip }));
    await svc.from("chat_ip_rate_limits").insert(rows);

    const { baseUrl } = getTestEnv();
    const res = await fetch(`${baseUrl}/api/chat/${company.slug}/malu`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": ip },
      body: JSON.stringify({ sessionId: randomUUID(), message: "Hi" }),
    });
    expect(res.status).toBe(429);
  });
});
