import { describe, expect, it } from "vitest";
import { api } from "./helpers/request";
import { signUpTestUser } from "./helpers/auth";
import { getTestServiceClient } from "./helpers/service-client";

// Trello P2 -- the billing DB layer: company_billing, company_message_usage,
// stripe_webhook_events, and the record_ai_reply() RPC. There is no P3/P4
// route yet, so every write here goes through the service-role client (the
// only writer these tables will ever have), and the assertions hit PostgREST
// directly to prove the RLS / grant / atomicity behaviour at the database
// level, bypassing the Next.js app entirely.

async function createCompany(ownerCookie: string, name: string) {
  const created = await api<{ company: { id: string } }>("POST", "/api/companies", ownerCookie, { name });
  return created.json.company.id;
}

describe("Billing & usage schema (Trello P2)", () => {
  it("lets a company member read billing + usage, and hides both from outsiders", async () => {
    const owner = await signUpTestUser("owner");
    const outsider = await signUpTestUser("outsider");
    const companyId = await createCompany(owner.cookieHeader, "Billing Read Co");

    const svc = getTestServiceClient();
    const periodStart = new Date().toISOString();

    const billingInsert = await svc.from("company_billing").insert({
      company_id: companyId,
      stripe_customer_id: "cus_test_read",
      stripe_subscription_id: "sub_test_read",
      plan_key: "starter",
      subscription_status: "active",
      current_period_start: periodStart,
      current_period_end: new Date(Date.now() + 30 * 24 * 3600_000).toISOString(),
    });
    expect(billingInsert.error).toBeNull();

    const usageInsert = await svc.from("company_message_usage").insert({
      company_id: companyId,
      period_start: periodStart,
      replies_used: 0,
      reply_limit: 10_000,
    });
    expect(usageInsert.error).toBeNull();

    // Member: sees the rows.
    const memberBilling = await owner.client
      .from("company_billing")
      .select("plan_key, subscription_status")
      .eq("company_id", companyId);
    expect(memberBilling.error).toBeNull();
    expect(memberBilling.data).toEqual([{ plan_key: "starter", subscription_status: "active" }]);

    const memberUsage = await owner.client
      .from("company_message_usage")
      .select("replies_used, reply_limit")
      .eq("company_id", companyId);
    expect(memberUsage.error).toBeNull();
    expect(memberUsage.data).toEqual([{ replies_used: 0, reply_limit: 10_000 }]);

    // Outsider: RLS filters the rows out (empty, not an error, on SELECT).
    const outsiderBilling = await outsider.client
      .from("company_billing")
      .select("plan_key")
      .eq("company_id", companyId);
    expect(outsiderBilling.error).toBeNull();
    expect(outsiderBilling.data).toEqual([]);

    const outsiderUsage = await outsider.client
      .from("company_message_usage")
      .select("replies_used")
      .eq("company_id", companyId);
    expect(outsiderUsage.error).toBeNull();
    expect(outsiderUsage.data).toEqual([]);
  });

  it("blocks every authenticated role from writing company_billing directly", async () => {
    const owner = await signUpTestUser("owner");
    const companyId = await createCompany(owner.cookieHeader, "Billing Write Lock Co");

    const svc = getTestServiceClient();
    await svc.from("company_billing").insert({
      company_id: companyId,
      plan_key: "starter",
      subscription_status: "active",
    });

    // insert / update / delete are all revoked from authenticated + anon
    // (P3 route and P4 webhook use the service-role client). Postgres denies
    // at the grant level -> 42501, before RLS is even considered.
    const insert = await owner.client
      .from("company_billing")
      .insert({ company_id: companyId, plan_key: "pro", subscription_status: "active" })
      .select();
    expect(insert.error?.code).toBe("42501");

    const update = await owner.client
      .from("company_billing")
      .update({ plan_key: "enterprise" })
      .eq("company_id", companyId)
      .select();
    expect(update.error?.code).toBe("42501");

    const del = await owner.client.from("company_billing").delete().eq("company_id", companyId).select();
    expect(del.error?.code).toBe("42501");

    // The row is untouched.
    const svcRead = await svc.from("company_billing").select("plan_key").eq("company_id", companyId).single();
    expect(svcRead.data?.plan_key).toBe("starter");
  });

  it("record_ai_reply increments the current period atomically under concurrency", async () => {
    const owner = await signUpTestUser("owner");
    const companyId = await createCompany(owner.cookieHeader, "Record Reply Co");

    const svc = getTestServiceClient();
    const periodStart = new Date().toISOString();
    await svc.from("company_billing").insert({
      company_id: companyId,
      plan_key: "pro",
      subscription_status: "active",
      current_period_start: periodStart,
      current_period_end: new Date(Date.now() + 30 * 24 * 3600_000).toISOString(),
    });
    await svc.from("company_message_usage").insert({
      company_id: companyId,
      period_start: periodStart,
      replies_used: 0,
      reply_limit: 10_000,
    });

    const FIRE = 25;
    const results = await Promise.all(
      Array.from({ length: FIRE }, () =>
        svc.rpc("record_ai_reply", { p_company_id: companyId }),
      ),
    );

    // Every call succeeded and reported the plan's limit.
    for (const r of results) {
      expect(r.error).toBeNull();
      expect(r.data).toHaveLength(1);
      expect(r.data[0].reply_limit).toBe(10_000);
    }

    // No increment was lost: the counts returned are exactly 1..FIRE, and
    // the row lands on FIRE.
    const returnedCounts = results.map((r) => r.data[0].replies_used).sort((a, b) => a - b);
    expect(returnedCounts).toEqual(Array.from({ length: FIRE }, (_, i) => i + 1));

    const finalRow = await svc
      .from("company_message_usage")
      .select("replies_used")
      .eq("company_id", companyId)
      .single();
    expect(finalRow.data?.replies_used).toBe(FIRE);
  });

  it("record_ai_reply is a caller-safe no-op when no usage row exists for the period", async () => {
    const owner = await signUpTestUser("owner");
    const companyId = await createCompany(owner.cookieHeader, "No Usage Row Co");

    const svc = getTestServiceClient();
    // Billing row exists, but the P4 webhook has not provisioned the period's
    // usage row yet.
    await svc.from("company_billing").insert({
      company_id: companyId,
      plan_key: "starter",
      subscription_status: "active",
      current_period_start: new Date().toISOString(),
      current_period_end: new Date(Date.now() + 30 * 24 * 3600_000).toISOString(),
    });

    const res = await svc.rpc("record_ai_reply", { p_company_id: companyId });
    expect(res.error).toBeNull();
    expect(res.data).toEqual([]);
  });

  it("record_ai_reply cannot be executed by a regular authenticated client", async () => {
    const owner = await signUpTestUser("owner");
    const companyId = await createCompany(owner.cookieHeader, "Record Reply Grant Co");

    const res = await owner.client.rpc("record_ai_reply", { p_company_id: companyId });
    expect(res.error).not.toBeNull();
  });

  it("stripe_webhook_events rejects a duplicate event_id", async () => {
    const svc = getTestServiceClient();
    const eventId = `evt_test_${crypto.randomUUID()}`;

    const first = await svc.from("stripe_webhook_events").insert({ event_id: eventId, type: "checkout.session.completed" });
    expect(first.error).toBeNull();

    const second = await svc.from("stripe_webhook_events").insert({ event_id: eventId, type: "checkout.session.completed" });
    expect(second.error?.code).toBe("23505");
  });

  it("hides stripe_webhook_events from authenticated clients entirely", async () => {
    const user = await signUpTestUser("user");
    const svc = getTestServiceClient();
    const eventId = `evt_test_${crypto.randomUUID()}`;
    await svc.from("stripe_webhook_events").insert({ event_id: eventId, type: "invoice.paid" });

    const read = await user.client.from("stripe_webhook_events").select("event_id").eq("event_id", eventId);
    // RLS enabled, zero policies -> no rows for any non-service role.
    expect(read.data).toEqual([]);
  });
});
