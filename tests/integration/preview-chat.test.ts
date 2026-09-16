import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { api } from "./helpers/request";
import { signUpTestUser, type TestUser } from "./helpers/auth";
import { getTestServiceClient } from "./helpers/service-client";
import { seedActivePlan } from "./helpers/billing";

// The first session's proof step. What it must prove here is the negative:
// the merchant rehearsing with their own hire leaves nothing behind in the
// agenda, the inbox or the numbers.
describe("Preview chat", () => {
  async function hiredCompany(owner: TestUser, slug: "malu" | "ana", withPlan = false) {
    const created = await api<{ company: { id: string } }>("POST", "/api/companies", owner.cookieHeader, {
      name: `Preview Co ${randomUUID().slice(0, 8)}`,
    });
    const companyId = created.json.company.id;
    if (withPlan) await seedActivePlan(companyId);
    await api("POST", `/api/companies/${companyId}/agents/${slug}`, owner.cookieHeader, {});
    return companyId;
  }

  function path(companyId: string, slug: string) {
    return `/api/companies/${companyId}/agents/${slug}/preview-chat`;
  }

  it("requires a signed-in member of the company", async () => {
    const owner = await signUpTestUser("owner");
    const outsider = await signUpTestUser("outsider");
    const companyId = await hiredCompany(owner, "malu");

    expect((await api("POST", path(companyId, "malu"), undefined, { message: "oi" })).status).toBe(401);
    expect(
      (await api("POST", path(companyId, "malu"), outsider.cookieHeader, { message: "oi" })).status,
    ).toBe(403);
  });

  it("rejects an agent the company never hired", async () => {
    const owner = await signUpTestUser("owner");
    const created = await api<{ company: { id: string } }>("POST", "/api/companies", owner.cookieHeader, {
      name: `No Hire Co ${randomUUID().slice(0, 8)}`,
    });
    const res = await api("POST", path(created.json.company.id, "malu"), owner.cookieHeader, {
      message: "oi",
    });
    expect(res.status).toBe(400);
  });

  it("validates the message", async () => {
    const owner = await signUpTestUser("owner");
    const companyId = await hiredCompany(owner, "malu");

    expect((await api("POST", path(companyId, "malu"), owner.cookieHeader, {})).status).toBe(400);
    expect(
      (await api("POST", path(companyId, "malu"), owner.cookieHeader, { message: "   " })).status,
    ).toBe(400);
    expect(
      (await api("POST", path(companyId, "malu"), owner.cookieHeader, { message: "x".repeat(2100) }))
        .status,
    ).toBe(400);
  });

  // The whole point of the flag: this conversation exists (the engine needs
  // one) but must not surface anywhere the merchant reads their real work.
  it("keeps its conversation out of the inbox and out of the analytics", async () => {
    const owner = await signUpTestUser("owner");
    const companyId = await hiredCompany(owner, "malu", true);
    const svc = getTestServiceClient();

    const { data: agent } = await svc.from("agents").select("id").eq("slug", "malu").single();
    const { data: customer } = await svc
      .from("customers")
      .insert({ company_id: companyId, channel: "web_chat", name: "Preview" })
      .select("id")
      .single();
    const { data: preview } = await svc
      .from("conversations")
      .insert({
        company_id: companyId,
        agent_id: (agent as { id: string }).id,
        customer_id: (customer as { id: string }).id,
        channel: "web_chat",
        status: "active",
        is_preview: true,
      })
      .select("id")
      .single();
    const previewId = (preview as { id: string }).id;

    await svc.from("messages").insert([
      { company_id: companyId, conversation_id: previewId, role: "customer", content: "quanto custa?" },
      { company_id: companyId, conversation_id: previewId, role: "agent", content: "R$ 51,79" },
    ]);

    const inbox = await api<{ conversations: { id: string }[]; total: number }>(
      "GET",
      `/api/companies/${companyId}/conversations`,
      owner.cookieHeader,
    );
    expect(inbox.json.total).toBe(0);
    expect(inbox.json.conversations).toHaveLength(0);

    // Not openable by guessing the id either.
    const detail = await api("GET", `/api/companies/${companyId}/conversations/${previewId}`, owner.cookieHeader);
    expect(detail.status).toBe(404);

    const analytics = await api<{ metrics: { metric: string; total: number }[] }>(
      "GET",
      `/api/companies/${companyId}/analytics`,
      owner.cookieHeader,
    );
    const byMetric = new Map(analytics.json.metrics.map((m) => [m.metric, m.total]));
    expect(byMetric.get("conversations")).toBe(0);
    expect(byMetric.get("messages")).toBe(0);
  });

  it("still counts a real conversation, so the exclusion is not a blanket zero", async () => {
    const owner = await signUpTestUser("owner");
    const companyId = await hiredCompany(owner, "malu", true);
    const svc = getTestServiceClient();

    const { data: agent } = await svc.from("agents").select("id").eq("slug", "malu").single();
    const { data: customer } = await svc
      .from("customers")
      .insert({ company_id: companyId, channel: "web_chat", web_chat_session_id: randomUUID() })
      .select("id")
      .single();
    await svc.from("conversations").insert({
      company_id: companyId,
      agent_id: (agent as { id: string }).id,
      customer_id: (customer as { id: string }).id,
      channel: "web_chat",
      status: "active",
    });

    const inbox = await api<{ total: number }>(
      "GET",
      `/api/companies/${companyId}/conversations`,
      owner.cookieHeader,
    );
    expect(inbox.json.total).toBe(1);

    const analytics = await api<{ metrics: { metric: string; total: number }[] }>(
      "GET",
      `/api/companies/${companyId}/analytics`,
      owner.cookieHeader,
    );
    const byMetric = new Map(analytics.json.metrics.map((m) => [m.metric, m.total]));
    expect(byMetric.get("conversations")).toBe(1);
  });
});
