import { describe, expect, it } from "vitest";
import { api } from "./helpers/request";
import { signUpTestUser } from "./helpers/auth";
import { getTestServiceClient } from "./helpers/service-client";
import { loadPlanAndChannelFacts } from "@/lib/setup/checklist";

async function createCompany(ownerCookie: string, name: string) {
  const created = await api<{ company: { id: string } }>("POST", "/api/companies", ownerCookie, { name });
  return created.json.company.id;
}

async function insertConversation(companyId: string, isPreview: boolean) {
  const service = getTestServiceClient();
  const { data: agent } = await service.from("agents").select("id").eq("slug", "malu").single();
  const { data: customer } = await service
    .from("customers")
    .insert({ company_id: companyId, channel: "whatsapp" })
    .select("id")
    .single();
  const { error } = await service.from("conversations").insert({
    company_id: companyId,
    agent_id: agent!.id,
    customer_id: customer!.id,
    channel: "whatsapp",
    is_preview: isPreview,
  });
  expect(error).toBeNull();
}

describe("loadPlanAndChannelFacts(): the getting-started guide's plan and channel signals", () => {
  it("reports neither a plan nor a live channel for a fresh company", async () => {
    const owner = await signUpTestUser("owner");
    const companyId = await createCompany(owner.cookieHeader, "Fresh Guide Co");

    expect(await loadPlanAndChannelFacts(owner.client, companyId)).toEqual({ planChosen: false, channelLive: false });
  });

  it("counts an allowed site domain as a live channel", async () => {
    const owner = await signUpTestUser("owner");
    const companyId = await createCompany(owner.cookieHeader, "Widget Guide Co");

    const saved = await api("PATCH", `/api/companies/${companyId}`, owner.cookieHeader, {
      allowed_embed_domains: ["example.com"],
    });
    expect(saved.status).toBe(200);

    expect((await loadPlanAndChannelFacts(owner.client, companyId)).channelLive).toBe(true);
  });

  it("counts a real customer conversation, but not a preview one", async () => {
    const owner = await signUpTestUser("owner");
    const companyId = await createCompany(owner.cookieHeader, "Conversation Guide Co");

    await insertConversation(companyId, true);
    expect((await loadPlanAndChannelFacts(owner.client, companyId)).channelLive).toBe(false);

    await insertConversation(companyId, false);
    expect((await loadPlanAndChannelFacts(owner.client, companyId)).channelLive).toBe(true);
  });

  it("treats an unpaid subscription as a chosen plan (a problem to fix, not a plan to pick)", async () => {
    const owner = await signUpTestUser("owner");
    const companyId = await createCompany(owner.cookieHeader, "Unpaid Guide Co");
    const { error } = await getTestServiceClient()
      .from("company_billing")
      .insert({ company_id: companyId, plan_key: "intermediate", subscription_status: "unpaid" });
    expect(error).toBeNull();

    expect((await loadPlanAndChannelFacts(owner.client, companyId)).planChosen).toBe(true);
  });

  it("shows an outsider nothing about another company", async () => {
    const owner = await signUpTestUser("owner");
    const companyId = await createCompany(owner.cookieHeader, "Private Guide Co");
    await api("PATCH", `/api/companies/${companyId}`, owner.cookieHeader, { allowed_embed_domains: ["example.com"] });

    const outsider = await signUpTestUser("outsider");
    expect(await loadPlanAndChannelFacts(outsider.client, companyId)).toEqual({
      planChosen: false,
      channelLive: false,
    });
  });
});
