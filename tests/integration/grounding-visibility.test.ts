import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { api } from "./helpers/request";
import { signUpTestUser } from "./helpers/auth";
import { getTestServiceClient } from "./helpers/service-client";
import { seedActivePlan } from "./helpers/billing";

type ListResponse = {
  conversations: { id: string; pendingConfirmation: boolean }[];
  total: number;
  pendingTotal: number;
};

type StoredGrounding = {
  status: string;
  violations: { kind: string; text: string }[];
  claims?: number;
};

type DetailResponse = {
  messages: {
    role: string;
    content: string;
    grounding: (StoredGrounding & { claims: number }) | null;
  }[];
};

type Reply = {
  role: "customer" | "agent" | "merchant";
  content: string;
  grounding?: StoredGrounding | null;
  offsetMs: number;
};

describe("Grounding visibility", () => {
  async function createCompany(cookie: string) {
    const created = await api<{ company: { id: string } }>("POST", "/api/companies", cookie, {
      name: `Grounding Co ${randomUUID().slice(0, 8)}`,
    });
    const company = created.json.company;
    await seedActivePlan(company.id);
    await api("POST", `/api/companies/${company.id}/agents/malu`, cookie, {});
    return company;
  }

  async function seedConversation(
    companyId: string,
    replies: Reply[],
    status: "active" | "paused" | "closed" = "active",
  ) {
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

    const base = Date.now() - 60 * 60 * 1000;
    await svc.from("messages").insert(
      replies.map((reply) => ({
        company_id: companyId,
        conversation_id: conversationId,
        role: reply.role,
        content: reply.content,
        created_at: new Date(base + reply.offsetMs).toISOString(),
        metadata: reply.grounding === undefined ? null : { grounding: reply.grounding },
      })),
    );
    return conversationId;
  }

  const blockedReply = (offsetMs: number): Reply => ({
    role: "agent",
    content: "Deixa eu confirmar essa informação certinho pra não te passar nada errado, e já te falo 😊",
    grounding: { status: "blocked", violations: [{ kind: "price", text: "R$ 129,90" }], claims: 0 },
    offsetMs,
  });

  it("flags a blocked reply as an unconfirmed promise and counts it", async () => {
    const owner = await signUpTestUser("owner");
    const company = await createCompany(owner.cookieHeader);
    const conversationId = await seedConversation(company.id, [
      { role: "customer", content: "quanto custa o azul?", offsetMs: 0 },
      blockedReply(1000),
    ]);

    const res = await api<ListResponse>(
      "GET",
      `/api/companies/${company.id}/conversations`,
      owner.cookieHeader,
    );

    expect(res.status).toBe(200);
    expect(res.json.pendingTotal).toBe(1);
    expect(res.json.conversations.find((c) => c.id === conversationId)?.pendingConfirmation).toBe(true);
  });

  it("clears the pendency once a merchant answers after the blocked reply", async () => {
    const owner = await signUpTestUser("owner");
    const company = await createCompany(owner.cookieHeader);
    const conversationId = await seedConversation(company.id, [
      { role: "customer", content: "quanto custa o azul?", offsetMs: 0 },
      blockedReply(1000),
      { role: "merchant", content: "Confirmei: sai por R$ 129,90 😊", offsetMs: 2000 },
    ]);

    const res = await api<ListResponse>(
      "GET",
      `/api/companies/${company.id}/conversations`,
      owner.cookieHeader,
    );

    expect(res.json.pendingTotal).toBe(0);
    expect(res.json.conversations.find((c) => c.id === conversationId)?.pendingConfirmation).toBe(false);
  });

  it("re-opens the pendency when a later reply is blocked again", async () => {
    const owner = await signUpTestUser("owner");
    const company = await createCompany(owner.cookieHeader);
    await seedConversation(company.id, [
      blockedReply(0),
      { role: "merchant", content: "confirmado", offsetMs: 1000 },
      blockedReply(2000),
    ]);

    const res = await api<ListResponse>(
      "GET",
      `/api/companies/${company.id}/conversations`,
      owner.cookieHeader,
    );

    expect(res.json.pendingTotal).toBe(1);
  });

  it("does not chase a conversation the merchant already closed", async () => {
    const owner = await signUpTestUser("owner");
    const company = await createCompany(owner.cookieHeader);
    await seedConversation(company.id, [blockedReply(0)], "closed");

    const res = await api<ListResponse>(
      "GET",
      `/api/companies/${company.id}/conversations`,
      owner.cookieHeader,
    );

    expect(res.json.pendingTotal).toBe(0);
    expect(res.json.conversations[0]?.pendingConfirmation).toBe(false);
  });

  it("does not treat a corrected reply as something the merchant owes", async () => {
    const owner = await signUpTestUser("owner");
    const company = await createCompany(owner.cookieHeader);
    await seedConversation(company.id, [
      {
        role: "agent",
        content: "O azul sai por R$ 129,90 😊",
        grounding: { status: "regenerated", violations: [{ kind: "price", text: "R$ 99,00" }] },
        offsetMs: 1000,
      },
    ]);

    const res = await api<ListResponse>(
      "GET",
      `/api/companies/${company.id}/conversations`,
      owner.cookieHeader,
    );

    expect(res.json.pendingTotal).toBe(0);
  });

  it("narrows the list to only the unconfirmed promises when asked", async () => {
    const owner = await signUpTestUser("owner");
    const company = await createCompany(owner.cookieHeader);
    const pendingId = await seedConversation(company.id, [blockedReply(0)]);
    await seedConversation(company.id, [
      {
        role: "agent",
        content: "O azul sai por R$ 129,90 😊",
        grounding: { status: "grounded", violations: [] },
        offsetMs: 0,
      },
    ]);

    const all = await api<ListResponse>(
      "GET",
      `/api/companies/${company.id}/conversations`,
      owner.cookieHeader,
    );
    expect(all.json.total).toBe(2);

    const filtered = await api<ListResponse>(
      "GET",
      `/api/companies/${company.id}/conversations?pending=true`,
      owner.cookieHeader,
    );
    expect(filtered.json.total).toBe(1);
    expect(filtered.json.conversations).toHaveLength(1);
    expect(filtered.json.conversations[0].id).toBe(pendingId);
    expect(filtered.json.pendingTotal).toBe(1);
  });

  it("exposes each reply's outcome on the conversation detail, and null for legacy rows", async () => {
    const owner = await signUpTestUser("owner");
    const company = await createCompany(owner.cookieHeader);
    const conversationId = await seedConversation(company.id, [
      { role: "customer", content: "quanto custa?", offsetMs: 0 },
      { role: "agent", content: "resposta antiga sem verificação", offsetMs: 1000 },
      {
        role: "agent",
        content: "O azul sai por R$ 129,90 😊",
        grounding: {
          status: "regenerated",
          violations: [{ kind: "price", text: "R$ 99,00" }],
          claims: 1,
        },
        offsetMs: 2000,
      },
      {
        role: "agent",
        content: "Claro 😊 Você procura camiseta ou camisa?",
        grounding: { status: "grounded", violations: [], claims: 0 },
        offsetMs: 2500,
      },
      blockedReply(3000),
    ]);

    const res = await api<DetailResponse>(
      "GET",
      `/api/companies/${company.id}/conversations/${conversationId}`,
      owner.cookieHeader,
    );

    expect(res.status).toBe(200);
    const [customerMsg, legacy, regenerated, smallTalk, blocked] = res.json.messages;
    expect(customerMsg.grounding).toBeNull();
    expect(legacy.grounding).toBeNull();
    expect(regenerated.grounding).toEqual({
      status: "regenerated",
      violations: [{ kind: "price", text: "R$ 99,00" }],
      claims: 1,
    });
    // Trivially grounded: no figure in it, so nothing was verified and the
    // thread must not mark it as checked.
    expect(smallTalk.grounding).toEqual({ status: "grounded", violations: [], claims: 0 });
    expect(blocked.grounding?.status).toBe("blocked");
  });

  it("keeps one company's unconfirmed promises out of another's inbox", async () => {
    const [owner, other] = await Promise.all([signUpTestUser("owner"), signUpTestUser("other")]);
    const [company, otherCompany] = await Promise.all([
      createCompany(owner.cookieHeader),
      createCompany(other.cookieHeader),
    ]);
    await seedConversation(company.id, [blockedReply(0)]);

    const mine = await api<ListResponse>(
      "GET",
      `/api/companies/${company.id}/conversations`,
      owner.cookieHeader,
    );
    const theirs = await api<ListResponse>(
      "GET",
      `/api/companies/${otherCompany.id}/conversations`,
      other.cookieHeader,
    );

    expect(mine.json.pendingTotal).toBe(1);
    expect(theirs.json.pendingTotal).toBe(0);
  });
});
