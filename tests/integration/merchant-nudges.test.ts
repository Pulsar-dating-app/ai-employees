import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { api } from "./helpers/request";
import { signUpTestUser, type TestUser } from "./helpers/auth";
import { getTestServiceClient } from "./helpers/service-client";
import { seedActivePlan } from "./helpers/billing";
import { getTestEnv } from "./helpers/env";
import { sentEmails } from "./helpers/email";

// The merchant nudge cron (2026-10-26) end to end: real companies at the
// ages and states the rules care about, the real route, the Brevo mock.
describe("Merchant nudge e-mails (cron)", () => {
  const HOUR = 60 * 60 * 1000;

  async function runCron(secret = "test-cron-secret") {
    const { baseUrl } = getTestEnv();
    const res = await fetch(`${baseUrl}/api/cron/merchant-nudges`, {
      method: "POST",
      headers: { authorization: `Bearer ${secret}` },
    });
    return { status: res.status, json: (await res.json()) as Record<string, unknown> };
  }

  async function companyAged(user: TestUser, hoursAgo: number) {
    const created = await api<{ company: { id: string } }>("POST", "/api/companies", user.cookieHeader, {
      name: `Nudge Co ${randomUUID().slice(0, 8)}`,
    });
    const companyId = created.json.company.id;
    await getTestServiceClient()
      .from("companies")
      .update({ created_at: new Date(Date.now() - hoursAgo * HOUR).toISOString() })
      .eq("id", companyId);
    return companyId;
  }

  async function hireAnaAndFinish(user: TestUser, companyId: string) {
    await seedActivePlan(companyId);
    await api("POST", `/api/companies/${companyId}/agents/ana`, user.cookieHeader, {});
    await getTestServiceClient()
      .from("companies")
      .update({ onboarding_completed_at: new Date().toISOString() })
      .eq("id", companyId);
  }

  const mailsTo = async (to: string) => (await sentEmails()).filter((e) => e.to === to);

  it("refuses a call without the cron secret", async () => {
    expect((await runCron("wrong")).status).toBe(401);
  });

  it("nudges an owner who stopped mid-onboarding, once", async () => {
    const owner = await signUpTestUser("nudge-stalled");
    const companyId = await companyAged(owner, 25);

    expect((await runCron()).status).toBe(200);
    const mails = await mailsTo(owner.email);
    expect(mails).toHaveLength(1);
    expect(mails[0].text).toContain("/api/nudges/click?k=onboarding_stalled");

    const { data: rows } = await getTestServiceClient()
      .from("merchant_nudges")
      .select("kind")
      .eq("company_id", companyId);
    expect(rows).toEqual([{ kind: "onboarding_stalled" }]);

    await runCron();
    expect(await mailsTo(owner.email)).toHaveLength(1);
  });

  it("sends the hire's link to an owner who finished but never went live", async () => {
    const owner = await signUpTestUser("nudge-not-live");
    const companyId = await companyAged(owner, 30);
    await hireAnaAndFinish(owner, companyId);
    const { data: company } = await getTestServiceClient().from("companies").select("slug").eq("id", companyId).single();

    await runCron();
    const [mail] = await mailsTo(owner.email);
    expect(mail?.text).toContain(`/talk/${(company as { slug: string }).slug}/ana`);
    // Merchant-facing copy: no implementation jargon.
    expect(mail?.text).not.toMatch(/\b(IA|AI|agente|prompt|LLM)\b/);
  });

  it("leaves alone a company that is live, too new, or too old", async () => {
    const live = await signUpTestUser("nudge-live");
    const liveId = await companyAged(live, 30);
    await hireAnaAndFinish(live, liveId);
    await getTestServiceClient().from("companies").update({ allowed_embed_domains: ["example.com"] }).eq("id", liveId);

    const fresh = await signUpTestUser("nudge-fresh");
    await companyAged(fresh, 2);

    const old = await signUpTestUser("nudge-old");
    await companyAged(old, 24 * 8);

    await runCron();
    expect(await mailsTo(live.email)).toHaveLength(0);
    expect(await mailsTo(fresh.email)).toHaveLength(0);
    expect(await mailsTo(old.email)).toHaveLength(0);
  });

  it("keeps the nudge log out of merchants' reach", async () => {
    const owner = await signUpTestUser("nudge-rls");
    const companyId = await companyAged(owner, 25);
    await runCron();

    const read = await owner.client.from("merchant_nudges").select("kind").eq("company_id", companyId);
    expect(read.data ?? []).toHaveLength(0);
    const forged = await owner.client.from("merchant_nudges").delete().eq("company_id", companyId).select();
    expect(forged.data ?? []).toHaveLength(0);
  });
});
