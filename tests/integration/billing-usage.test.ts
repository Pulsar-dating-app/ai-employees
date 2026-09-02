import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { api } from "./helpers/request";
import { signUpTestUser } from "./helpers/auth";
import { getTestServiceClient } from "./helpers/service-client";
import { evaluateReplyGate, recordAiReply } from "@/lib/billing/enforcement";

// Trello P7 -- usage metering + the per-channel reply gate, against the real
// local Supabase stack.
//
// The band logic itself (within / over_plan / past_grace, hard stop on/off)
// is unit-tested on the pure `decideReplyGate` in tests/unit/billing/. Here
// we prove the parts that need a database: `evaluateReplyGate` reading and
// joining the two rows the way `record_ai_reply` does, `recordAiReply`
// actually incrementing the right period's row, and the web chat route
// wiring the gate in.
//
// The "counter goes +1 on a genuine AI reply over HTTP" path is NOT covered
// here: it needs a real AgentEngine.run(), and this suite makes no real
// OpenAI calls (same documented limitation as web-chat.test.ts /
// instagram-webhook.test.ts). `recordAiReply` is exercised directly instead.

const svc = getTestServiceClient();
const PERIOD_MS = 30 * 24 * 3600_000;

async function createCompany(ownerCookie: string, name: string) {
  const created = await api<{ company: { id: string; slug: string } }>(
    "POST",
    "/api/companies",
    ownerCookie,
    { name },
  );
  return created.json.company;
}

async function seedBilling(
  companyId: string,
  opts: { status: string; periodStart?: string; planKey?: string },
) {
  const { error } = await svc.from("company_billing").insert({
    company_id: companyId,
    plan_key: opts.planKey ?? "starter",
    subscription_status: opts.status,
    current_period_start: opts.periodStart ?? null,
    current_period_end: opts.periodStart
      ? new Date(new Date(opts.periodStart).getTime() + PERIOD_MS).toISOString()
      : null,
  });
  expect(error).toBeNull();
}

async function seedUsage(companyId: string, periodStart: string, repliesUsed: number, replyLimit: number) {
  const { error } = await svc.from("company_message_usage").insert({
    company_id: companyId,
    period_start: periodStart,
    replies_used: repliesUsed,
    reply_limit: replyLimit,
  });
  expect(error).toBeNull();
}

async function usedFor(companyId: string, periodStart: string) {
  const { data } = await svc
    .from("company_message_usage")
    .select("replies_used")
    .eq("company_id", companyId)
    .eq("period_start", periodStart)
    .single();
  return data?.replies_used ?? null;
}

describe("evaluateReplyGate (Trello P7)", () => {
  it("allows a company with no billing row at all", async () => {
    const owner = await signUpTestUser("owner");
    const { id } = await createCompany(owner.cookieHeader, "P7 No Billing Co");
    expect(await evaluateReplyGate(id, svc)).toEqual({ allow: true, overPlan: false });
  });

  it("blocks 'lapsed' when the subscription is past_due", async () => {
    const owner = await signUpTestUser("owner");
    const { id } = await createCompany(owner.cookieHeader, "P7 Lapsed Co");
    await seedBilling(id, { status: "past_due", periodStart: new Date().toISOString() });
    expect(await evaluateReplyGate(id, svc)).toEqual({ allow: false, reason: "lapsed" });
  });

  it("allows an active company that has no usage row for the period yet", async () => {
    const owner = await signUpTestUser("owner");
    const { id } = await createCompany(owner.cookieHeader, "P7 Active No Usage Co");
    await seedBilling(id, { status: "active", periodStart: new Date().toISOString() });
    expect(await evaluateReplyGate(id, svc)).toEqual({ allow: true, overPlan: false });
  });

  it("allows, not over plan, while under the snapshotted limit", async () => {
    const owner = await signUpTestUser("owner");
    const { id } = await createCompany(owner.cookieHeader, "P7 Under Limit Co");
    const periodStart = new Date().toISOString();
    await seedBilling(id, { status: "active", periodStart });
    await seedUsage(id, periodStart, 10, 100);
    expect(await evaluateReplyGate(id, svc)).toEqual({ allow: true, overPlan: false });
  });

  it("allows but flags overPlan at/over the limit inside the grace band", async () => {
    const owner = await signUpTestUser("owner");
    const { id } = await createCompany(owner.cookieHeader, "P7 Over Plan Co");
    const periodStart = new Date().toISOString();
    await seedBilling(id, { status: "active", periodStart });
    await seedUsage(id, periodStart, 100, 100);
    expect(await evaluateReplyGate(id, svc)).toEqual({ allow: true, overPlan: true });
  });

  it("keeps answering past the grace band by default, blocks only with the hard stop armed", async () => {
    const owner = await signUpTestUser("owner");
    const { id } = await createCompany(owner.cookieHeader, "P7 Past Grace Co");
    const periodStart = new Date().toISOString();
    await seedBilling(id, { status: "active", periodStart });
    await seedUsage(id, periodStart, 1000, 100);

    expect(await evaluateReplyGate(id, svc)).toEqual({ allow: true, overPlan: true });
    expect(await evaluateReplyGate(id, svc, { hardStopEnabled: true, graceMultiplier: 1.2 })).toEqual({
      allow: false,
      reason: "grace_exceeded",
    });
  });

  it("judges only the current period -- a maxed-out prior-period row does not block", async () => {
    const owner = await signUpTestUser("owner");
    const { id } = await createCompany(owner.cookieHeader, "P7 Period Rollover Co");
    const currentStart = new Date().toISOString();
    const priorStart = new Date(Date.now() - PERIOD_MS).toISOString();
    await seedBilling(id, { status: "active", periodStart: currentStart });
    await seedUsage(id, priorStart, 99999, 100); // last period, blown past
    await seedUsage(id, currentStart, 3, 100); // this period, fine

    expect(await evaluateReplyGate(id, svc, { hardStopEnabled: true })).toEqual({
      allow: true,
      overPlan: false,
    });
  });
});

describe("recordAiReply (Trello P7)", () => {
  it("increments the current period's row by one", async () => {
    const owner = await signUpTestUser("owner");
    const { id } = await createCompany(owner.cookieHeader, "P7 Record One Co");
    const periodStart = new Date().toISOString();
    await seedBilling(id, { status: "active", periodStart });
    await seedUsage(id, periodStart, 0, 100);

    await recordAiReply(id, svc);
    expect(await usedFor(id, periodStart)).toBe(1);

    await recordAiReply(id, svc);
    expect(await usedFor(id, periodStart)).toBe(2);
  });

  it("is a no-op (never throws) when the period has no usage row", async () => {
    const owner = await signUpTestUser("owner");
    const { id } = await createCompany(owner.cookieHeader, "P7 Record No Row Co");
    await seedBilling(id, { status: "active", periodStart: new Date().toISOString() });
    await expect(recordAiReply(id, svc)).resolves.toBeUndefined();
  });

  it("increments the current period's row, not a prior one", async () => {
    const owner = await signUpTestUser("owner");
    const { id } = await createCompany(owner.cookieHeader, "P7 Record Current Period Co");
    const currentStart = new Date().toISOString();
    const priorStart = new Date(Date.now() - PERIOD_MS).toISOString();
    await seedBilling(id, { status: "active", periodStart: currentStart });
    await seedUsage(id, priorStart, 40, 100);
    await seedUsage(id, currentStart, 0, 100);

    await recordAiReply(id, svc);

    expect(await usedFor(id, currentStart)).toBe(1);
    expect(await usedFor(id, priorStart)).toBe(40);
  });

  it("does not lose counts under concurrency", async () => {
    const owner = await signUpTestUser("owner");
    const { id } = await createCompany(owner.cookieHeader, "P7 Record Concurrent Co");
    const periodStart = new Date().toISOString();
    await seedBilling(id, { status: "active", periodStart });
    await seedUsage(id, periodStart, 0, 10_000);

    const FIRE = 20;
    await Promise.all(Array.from({ length: FIRE }, () => recordAiReply(id, svc)));

    expect(await usedFor(id, periodStart)).toBe(FIRE);
  });
});

describe("web chat route billing gate (Trello P7)", () => {
  async function hireMalu(ownerCookie: string, companyId: string) {
    await api("POST", `/api/companies/${companyId}/agents/malu`, ownerCookie, {});
  }

  it("a lapsed subscription gets no AI reply, and the customer's message is still persisted", async () => {
    const owner = await signUpTestUser("owner");
    const company = await createCompany(owner.cookieHeader, "P7 Chat Lapsed Co");
    await hireMalu(owner.cookieHeader, company.id);
    await seedBilling(company.id, { status: "past_due", periodStart: new Date().toISOString() });

    const { data: agent } = await svc.from("agents").select("id").eq("slug", "malu").single();
    const sessionId = randomUUID();
    const { data: customer } = await svc
      .from("customers")
      .insert({ company_id: company.id, channel: "web_chat", web_chat_session_id: sessionId })
      .select("id")
      .single();
    const { data: conversation } = await svc
      .from("conversations")
      .insert({
        company_id: company.id,
        agent_id: (agent as { id: string }).id,
        customer_id: (customer as { id: string }).id,
        channel: "web_chat",
        status: "active",
      })
      .select("id")
      .single();
    const conversationId = (conversation as { id: string }).id;

    const res = await api<{ reply: null }>("POST", `/api/chat/${company.slug}/malu`, undefined, {
      sessionId,
      message: "Still open?",
    });
    expect(res.status).toBe(200);
    expect(res.json.reply).toBeNull();

    const { count } = await svc
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("conversation_id", conversationId);
    expect(count).toBe(1); // the inbound customer message, no agent reply
  });
});
