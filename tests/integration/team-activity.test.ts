import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { api } from "./helpers/request";
import { signUpTestUser } from "./helpers/auth";
import { seedActivePlan } from "./helpers/billing";
import { getTestServiceClient } from "./helpers/service-client";
import { getTeamActivity } from "@/lib/agents/team-activity";

const NOW = new Date();
const DAY = 86_400_000;

async function setupCompany(label: string) {
  const owner = await signUpTestUser(label);
  const created = await api<{ company: { id: string } }>("POST", "/api/companies", owner.cookieHeader, {
    name: `Team Activity ${label}`,
  });
  const companyId = created.json.company.id;
  await seedActivePlan(companyId);
  const hire = await api<{ companyAgent: { agent_id: string } }>(
    "POST",
    `/api/companies/${companyId}/agents/malu`,
    owner.cookieHeader,
  );
  return { owner, companyId, agentId: hire.json.companyAgent.agent_id };
}

async function seedConversation(
  companyId: string,
  agentId: string,
  opts: { status: string; daysAgo: number; preview?: boolean; blocked?: boolean },
) {
  const svc = getTestServiceClient();
  const { data: customer } = await svc
    .from("customers")
    .insert({ company_id: companyId, channel: "web_chat", web_chat_session_id: randomUUID() })
    .select("id")
    .single();
  const { data: conversation, error } = await svc
    .from("conversations")
    .insert({
      company_id: companyId,
      agent_id: agentId,
      customer_id: (customer as { id: string }).id,
      channel: "web_chat",
      status: opts.status,
      is_preview: opts.preview ?? false,
      updated_at: new Date(NOW.getTime() - opts.daysAgo * DAY).toISOString(),
    })
    .select("id")
    .single();
  if (error) throw error;
  const conversationId = (conversation as { id: string }).id;
  if (opts.blocked) {
    await svc.from("messages").insert({
      company_id: companyId,
      conversation_id: conversationId,
      role: "agent",
      content: "Vou confirmar e já te retorno.",
      metadata: { grounding: { status: "blocked", claims: 1, violations: [] } },
    });
  }
  return conversationId;
}

describe("getTeamActivity", () => {
  it("counts a team member's week of conversations and everything waiting on the merchant", async () => {
    const { owner, companyId, agentId } = await setupCompany("activity-owner");

    await seedConversation(companyId, agentId, { status: "active", daysAgo: 1 });
    await seedConversation(companyId, agentId, { status: "active", daysAgo: 3 });
    await seedConversation(companyId, agentId, { status: "closed", daysAgo: 2 });
    await seedConversation(companyId, agentId, { status: "active", daysAgo: 20 });
    await seedConversation(companyId, agentId, { status: "paused", daysAgo: 15 });
    await seedConversation(companyId, agentId, { status: "active", daysAgo: 30, blocked: true });
    await seedConversation(companyId, agentId, { status: "active", daysAgo: 1, preview: true });

    const activity = await getTeamActivity(owner.client, companyId, NOW);

    expect(activity.get(agentId)).toEqual({ conversations: 3, needsYou: 2 });
  });

  it("never counts another company's conversations", async () => {
    const mine = await setupCompany("activity-mine");
    const theirs = await setupCompany("activity-theirs");
    await seedConversation(theirs.companyId, theirs.agentId, { status: "paused", daysAgo: 1 });

    const activity = await getTeamActivity(mine.owner.client, theirs.companyId, NOW);

    expect(activity.size).toBe(0);
  });
});
