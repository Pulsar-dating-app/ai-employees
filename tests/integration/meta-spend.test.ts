import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { api } from "./helpers/request";
import { signUpTestUser } from "./helpers/auth";
import { seedActivePlan } from "./helpers/billing";
import { getTestServiceClient } from "./helpers/service-client";
import { getMetaSpendSummary } from "@/lib/whatsapp/meta-spend";

// 2026-10-02 -- the Meta spend estimate on the billing page and the top-bar
// alert, for a merchant on their own Meta account. Counted from real rows,
// so this runs against Postgres rather than as a unit test.
describe("getMetaSpendSummary", () => {
  const service = getTestServiceClient();

  async function companyWithMetaNumber(planKey: string, provider: "meta" | "twilio" = "meta") {
    const owner = await signUpTestUser("owner");
    const created = await api<{ company: { id: string } }>("POST", "/api/companies", owner.cookieHeader, {
      name: `Meta Spend ${planKey} Co`,
    });
    const companyId = created.json.company.id;
    await seedActivePlan(companyId, { planKey });
    await api("POST", `/api/companies/${companyId}/agents/malu`, owner.cookieHeader);
    const { data: agent } = await service.from("agents").select("id").eq("slug", "malu").single();
    const agentId = (agent as { id: string }).id;
    await service.from("company_whatsapp_connections").insert({
      company_id: companyId,
      agent_id: agentId,
      phone_number_id: `phone-${randomUUID()}`,
      waba_id: `waba-${randomUUID()}`,
      access_token: "mock-token",
      status: "connected",
      provider,
    });
    return { companyId, agentId };
  }

  async function seedReplies(companyId: string, agentId: string, count: number, createdAt: string) {
    const { data: customer } = await service
      .from("customers")
      .insert({ company_id: companyId, channel: "whatsapp", phone: `55119${randomUUID().slice(0, 8)}` })
      .select("id")
      .single();
    const { data: conversation } = await service
      .from("conversations")
      .insert({
        company_id: companyId,
        agent_id: agentId,
        customer_id: (customer as { id: string }).id,
        channel: "whatsapp",
        status: "active",
      })
      .select("id")
      .single();
    const rows = Array.from({ length: count }, (_, i) => ({
      company_id: companyId,
      conversation_id: (conversation as { id: string }).id,
      role: i % 2 === 0 ? "agent" : "merchant",
      content: "resposta",
      created_at: createdAt,
    }));
    const { error } = await service.from("messages").insert(rows);
    expect(error).toBeNull();
  }

  it("estimates the month's spend, free replies left and the alert level for a Meta-direct number", async () => {
    const { companyId, agentId } = await companyWithMetaNumber("starter");
    const now = new Date();
    await seedReplies(companyId, agentId, 2_100, now.toISOString());
    await seedReplies(companyId, agentId, 500, new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 15)).toISOString());

    const spend = await getMetaSpendSummary(service, companyId, now);
    expect(spend).not.toBeNull();
    expect(spend!.spentCents).toBe(1_100 * 4);
    expect(spend!.freeRepliesLeft).toBe(0);
    expect(spend!.ceilingCents).toBe(2_000 * 4);
    expect(spend!.alertLevel).toBe(50);
  });

  it("shows nothing on a _wpp plan, where Staffra pays Meta", async () => {
    const { companyId } = await companyWithMetaNumber("starter_wpp", "twilio");
    expect(await getMetaSpendSummary(service, companyId)).toBeNull();
  });
});
