import { describe, expect, it } from "vitest";
import Stripe from "stripe";
import { api } from "./helpers/request";
import { signUpTestUser } from "./helpers/auth";
import { getTestEnv } from "./helpers/env";
import { getTestServiceClient } from "./helpers/service-client";
import { FREE_REPLY_LIMIT, getPlan } from "@/lib/billing/plans";
import { evaluateReplyGate } from "@/lib/billing/enforcement";
import { getUsageSummary } from "@/lib/billing/usage-summary";

// Staffra Free (2026-10-23): activated by the checkout route with no Stripe
// call at all, its month rolled lazily by `roll_free_plan_period`, and the
// Stripe webhook kept from knocking it off the plan with a stale event.

const svc = getTestServiceClient();
const MONTH_MS = 30 * 24 * 3600_000;

async function createCompany(ownerCookie: string, name: string) {
  const created = await api<{ company: { id: string } }>("POST", "/api/companies", ownerCookie, { name });
  return created.json.company.id;
}

function checkout(cookie: string, companyId: string, planKey: string, returnTo?: string) {
  return api<{ ok: boolean; mode: string; url: string | null; code?: string }>(
    "POST",
    `/api/companies/${companyId}/billing/checkout`,
    cookie,
    { planKey, ...(returnTo ? { returnTo } : {}) },
  );
}

async function readBilling(companyId: string) {
  const { data } = await svc
    .from("company_billing")
    .select(
      "plan_key, subscription_status, stripe_customer_id, stripe_subscription_id, current_period_start, current_period_end",
    )
    .eq("company_id", companyId)
    .single();
  return data!;
}

async function usageRow(companyId: string, periodStart: string) {
  const { data } = await svc
    .from("company_message_usage")
    .select("replies_used, reply_limit")
    .eq("company_id", companyId)
    .eq("period_start", periodStart)
    .maybeSingle();
  return data;
}

async function seedFree(companyId: string, periodStart: Date, repliesUsed = 0) {
  const start = periodStart.toISOString();
  const end = new Date(periodStart.getTime() + MONTH_MS).toISOString();
  expect(
    (
      await svc.from("company_billing").insert({
        company_id: companyId,
        plan_key: "free",
        subscription_status: "active",
        current_period_start: start,
        current_period_end: end,
      })
    ).error,
  ).toBeNull();
  expect(
    (
      await svc.from("company_message_usage").insert({
        company_id: companyId,
        period_start: start,
        replies_used: repliesUsed,
        reply_limit: FREE_REPLY_LIMIT,
      })
    ).error,
  ).toBeNull();
  return start;
}

describe("Staffra Free activation (checkout route)", () => {
  it("activates without touching Stripe: no customer, no subscription, a 500-reply month", async () => {
    const owner = await signUpTestUser("owner");
    const companyId = await createCompany(owner.cookieHeader, "Free Activate Co");

    const res = await checkout(owner.cookieHeader, companyId, "free");
    expect(res.status).toBe(200);
    expect(res.json.mode).toBe("free");
    expect(res.json.url).toMatch(/\/dashboard\/settings\/billing\?checkout=success$/);

    const billing = await readBilling(companyId);
    expect(billing.plan_key).toBe("free");
    expect(billing.subscription_status).toBe("active");
    expect(billing.stripe_customer_id).toBeNull();
    expect(billing.stripe_subscription_id).toBeNull();
    const periodMs =
      new Date(billing.current_period_end as string).getTime() -
      new Date(billing.current_period_start as string).getTime();
    expect(periodMs).toBeGreaterThanOrEqual(28 * 24 * 3600_000);
    expect(periodMs).toBeLessThanOrEqual(31 * 24 * 3600_000);

    expect(await usageRow(companyId, billing.current_period_start as string)).toEqual({
      replies_used: 0,
      reply_limit: FREE_REPLY_LIMIT,
    });
  });

  it("returns into the onboarding flow when asked to", async () => {
    const owner = await signUpTestUser("owner");
    const companyId = await createCompany(owner.cookieHeader, "Free Onboarding Co");
    const res = await checkout(owner.cookieHeader, companyId, "free", "/onboarding/plan");
    expect(res.json.url).toMatch(/\/onboarding\/plan\?checkout=success$/);
  });

  it("puts a hire parked for lack of a plan back to work, like a paid plan's first activation", async () => {
    const owner = await signUpTestUser("owner");
    const companyId = await createCompany(owner.cookieHeader, "Free Hire Co");
    expect((await api("POST", `/api/companies/${companyId}/agents/malu`, owner.cookieHeader)).status).toBe(201);
    await svc.from("company_agents").update({ status: "paused" }).eq("company_id", companyId);

    await checkout(owner.cookieHeader, companyId, "free");

    const { data: hires } = await svc.from("company_agents").select("status").eq("company_id", companyId);
    expect(hires?.map((h) => h.status)).toEqual(["active"]);
  });

  it("picking it again never resets a spent quota", async () => {
    const owner = await signUpTestUser("owner");
    const companyId = await createCompany(owner.cookieHeader, "Free Twice Co");
    await checkout(owner.cookieHeader, companyId, "free");
    const first = await readBilling(companyId);
    await svc
      .from("company_message_usage")
      .update({ replies_used: 321 })
      .eq("company_id", companyId)
      .eq("period_start", first.current_period_start as string);

    const again = await checkout(owner.cookieHeader, companyId, "free");
    expect(again.status).toBe(200);

    const second = await readBilling(companyId);
    expect(second.current_period_start).toBe(first.current_period_start);
    expect((await usageRow(companyId, first.current_period_start as string))?.replies_used).toBe(321);
  });

  it("refuses while a paid subscription is still live", async () => {
    const owner = await signUpTestUser("owner");
    const companyId = await createCompany(owner.cookieHeader, "Free Live Sub Co");
    await svc.from("company_billing").insert({
      company_id: companyId,
      stripe_customer_id: "cus_seed_free_live",
      stripe_subscription_id: "sub_mock_starter",
      subscription_status: "active",
      plan_key: "starter",
    });

    const res = await checkout(owner.cookieHeader, companyId, "free");
    expect(res.status).toBe(409);
    expect(res.json.code).toBe("free_requires_no_subscription");
    expect((await readBilling(companyId)).plan_key).toBe("starter");
  });

  it("takes over a canceled paid plan, keeping the Stripe customer for a later upgrade", async () => {
    const owner = await signUpTestUser("owner");
    const companyId = await createCompany(owner.cookieHeader, "Free After Cancel Co");
    await svc.from("company_billing").insert({
      company_id: companyId,
      stripe_customer_id: "cus_seed_free_after_cancel",
      stripe_subscription_id: "sub_mock_starter__canceled",
      subscription_status: "canceled",
      plan_key: "starter",
    });

    expect((await checkout(owner.cookieHeader, companyId, "free")).status).toBe(200);
    const billing = await readBilling(companyId);
    expect(billing.plan_key).toBe("free");
    expect(billing.subscription_status).toBe("active");
    expect(billing.stripe_subscription_id).toBeNull();
    expect(billing.stripe_customer_id).toBe("cus_seed_free_after_cancel");
  });

  it("upgrades through a normal Checkout, staying on Staffra Free until the subscription lands", async () => {
    const owner = await signUpTestUser("owner");
    const companyId = await createCompany(owner.cookieHeader, "Free Upgrade Co");
    await checkout(owner.cookieHeader, companyId, "free");

    const res = await checkout(owner.cookieHeader, companyId, "starter");
    expect(res.status).toBe(200);
    expect(res.json.mode).toBe("checkout");

    const billing = await readBilling(companyId);
    expect(billing.plan_key).toBe("free");
    expect(billing.subscription_status).toBe("active");
    expect(billing.stripe_customer_id).toMatch(/^cus_mock/);
  });

  it("adopts the upgrade's subscription when its checkout webhook was lost", async () => {
    const owner = await signUpTestUser("owner");
    const companyId = await createCompany(owner.cookieHeader, "Free Upgrade Reconcile Co");
    await seedFree(companyId, new Date());
    // Mock: this customer id shape means "Stripe has a live starter sub".
    await svc
      .from("company_billing")
      .update({ stripe_customer_id: `cus_livesub_starter__co_${companyId}` })
      .eq("company_id", companyId);

    const res = await checkout(owner.cookieHeader, companyId, "pro");
    expect(res.json.mode).toBe("portal");

    const billing = await readBilling(companyId);
    expect(billing.plan_key).toBe("starter");
    expect(billing.stripe_subscription_id).toBe(`sub_mock_starter__co_${companyId}`);
    expect((await usageRow(companyId, billing.current_period_start as string))?.reply_limit).toBe(
      getPlan("starter").monthlyReplyLimit,
    );
  });
});

describe("Staffra Free reply gate and monthly reset", () => {
  it("blocks at the quota with no grace band", async () => {
    const owner = await signUpTestUser("owner");
    const companyId = await createCompany(owner.cookieHeader, "Free Gate Co");
    const start = await seedFree(companyId, new Date(), FREE_REPLY_LIMIT - 1);

    expect(await evaluateReplyGate(companyId, svc)).toEqual({ allow: true, overPlan: false });
    await svc
      .from("company_message_usage")
      .update({ replies_used: FREE_REPLY_LIMIT })
      .eq("company_id", companyId)
      .eq("period_start", start);
    expect(await evaluateReplyGate(companyId, svc, { hardStopEnabled: false })).toEqual({
      allow: false,
      reason: "grace_exceeded",
    });
  });

  it("opens a fresh month once the period has ended, before deciding", async () => {
    const owner = await signUpTestUser("owner");
    const companyId = await createCompany(owner.cookieHeader, "Free Rollover Co");
    const oldStart = await seedFree(companyId, new Date(Date.now() - MONTH_MS - 3 * 24 * 3600_000), FREE_REPLY_LIMIT);

    expect(await evaluateReplyGate(companyId, svc)).toEqual({ allow: true, overPlan: false });

    const billing = await readBilling(companyId);
    expect(billing.current_period_start).not.toBe(oldStart);
    expect(new Date(billing.current_period_start as string).getTime()).toBeLessThanOrEqual(Date.now());
    expect(new Date(billing.current_period_end as string).getTime()).toBeGreaterThan(Date.now());
    expect(await usageRow(companyId, billing.current_period_start as string)).toEqual({
      replies_used: 0,
      reply_limit: FREE_REPLY_LIMIT,
    });
    // The spent month stays as history.
    expect((await usageRow(companyId, oldStart))?.replies_used).toBe(FREE_REPLY_LIMIT);
  });

  it("jumps an idle company straight to the month containing now", async () => {
    const owner = await signUpTestUser("owner");
    const companyId = await createCompany(owner.cookieHeader, "Free Idle Co");
    await seedFree(companyId, new Date(Date.now() - 4 * MONTH_MS));

    expect(await getUsageSummary(companyId, svc)).toEqual({ used: 0, limit: FREE_REPLY_LIMIT });

    const billing = await readBilling(companyId);
    expect(new Date(billing.current_period_start as string).getTime()).toBeLessThanOrEqual(Date.now());
    expect(new Date(billing.current_period_end as string).getTime()).toBeGreaterThan(Date.now());
    const { count } = await svc
      .from("company_message_usage")
      .select("company_id", { count: "exact", head: true })
      .eq("company_id", companyId);
    expect(count).toBe(2);
  });

  it("rolls once under concurrent callers", async () => {
    const owner = await signUpTestUser("owner");
    const companyId = await createCompany(owner.cookieHeader, "Free Concurrent Co");
    await seedFree(companyId, new Date(Date.now() - MONTH_MS - 24 * 3600_000));

    const starts = await Promise.all(
      Array.from({ length: 10 }, () =>
        svc.rpc("roll_free_plan_period", { p_company_id: companyId, p_reply_limit: FREE_REPLY_LIMIT }),
      ),
    );
    expect(new Set(starts.map((r) => r.data)).size).toBe(1);
    const { count } = await svc
      .from("company_message_usage")
      .select("company_id", { count: "exact", head: true })
      .eq("company_id", companyId);
    expect(count).toBe(2);
  });

  // Paid periods belong to the Stripe webhook; the roll must never move one.
  it("never rolls a paid plan's period, even an ended one", async () => {
    const owner = await signUpTestUser("owner");
    const companyId = await createCompany(owner.cookieHeader, "Free Roll Paid Co");
    const start = new Date(Date.now() - 2 * MONTH_MS).toISOString();
    await svc.from("company_billing").insert({
      company_id: companyId,
      plan_key: "starter",
      subscription_status: "active",
      stripe_subscription_id: "sub_mock_starter",
      current_period_start: start,
      current_period_end: new Date(Date.now() - MONTH_MS).toISOString(),
    });

    const { data, error } = await svc.rpc("roll_free_plan_period", {
      p_company_id: companyId,
      p_reply_limit: FREE_REPLY_LIMIT,
    });
    expect(error).toBeNull();
    expect(data).toBeNull();
    expect(new Date((await readBilling(companyId)).current_period_start as string).getTime()).toBe(
      new Date(start).getTime(),
    );
  });

  it("never rolls a free row that carries a Stripe subscription", async () => {
    const owner = await signUpTestUser("owner");
    const companyId = await createCompany(owner.cookieHeader, "Free Roll With Sub Co");
    await seedFree(companyId, new Date(Date.now() - 2 * MONTH_MS));
    await svc.from("company_billing").update({ stripe_subscription_id: "sub_mock_starter" }).eq("company_id", companyId);

    const { data } = await svc.rpc("roll_free_plan_period", {
      p_company_id: companyId,
      p_reply_limit: FREE_REPLY_LIMIT,
    });
    expect(data).toBeNull();
  });

  it("keeps both functions out of a merchant's reach", async () => {
    const owner = await signUpTestUser("owner");
    const companyId = await createCompany(owner.cookieHeader, "Free RPC Grant Co");
    for (const fn of ["activate_free_plan", "roll_free_plan_period"]) {
      const { error } = await owner.client.rpc(fn, { p_company_id: companyId, p_reply_limit: 999_999 });
      expect(error, fn).not.toBeNull();
    }
    const { data } = await svc.from("company_billing").select("company_id").eq("company_id", companyId);
    expect(data).toEqual([]);
  });
});

describe("Stripe webhook vs. Staffra Free", () => {
  const WEBHOOK_SECRET = "whsec_test_secret";
  const signer = new Stripe("sk_test_ignored");

  function subscriptionEvent(type: string, companyId: string, status: string, lookupKey: string) {
    const now = Math.floor(Date.now() / 1000);
    return {
      id: `evt_${crypto.randomUUID()}`,
      object: "event",
      api_version: "2026-08-26.dahlia",
      created: now,
      type,
      data: {
        object: {
          id: `sub_free_${companyId}_${status}`,
          object: "subscription",
          status,
          cancel_at_period_end: false,
          customer: `cus_${companyId}`,
          metadata: { companyId },
          items: {
            object: "list",
            data: [
              {
                id: "si_free",
                object: "subscription_item",
                current_period_start: now,
                current_period_end: now + 30 * 24 * 3600,
                price: { object: "price", id: "price_free_evt", lookup_key: lookupKey },
              },
            ],
          },
        },
      },
    };
  }

  async function postEvent(event: object) {
    const payload = JSON.stringify(event);
    const signature = signer.webhooks.generateTestHeaderString({ payload, secret: WEBHOOK_SECRET });
    const res = await fetch(`${getTestEnv().baseUrl}/api/webhooks/stripe`, {
      method: "POST",
      headers: { "content-type": "application/json", "stripe-signature": signature },
      body: payload,
    });
    return res.status;
  }

  it("ignores a late cancellation from the paid subscription it had before", async () => {
    const owner = await signUpTestUser("owner");
    const companyId = await createCompany(owner.cookieHeader, "Free Stale Event Co");
    const start = await seedFree(companyId, new Date());

    const lookupKey = getPlan("starter").stripeLookupKey!;
    expect(await postEvent(subscriptionEvent("customer.subscription.deleted", companyId, "canceled", lookupKey))).toBe(200);

    const billing = await readBilling(companyId);
    expect(billing.plan_key).toBe("free");
    expect(billing.subscription_status).toBe("active");
    expect(new Date(billing.current_period_start as string).getTime()).toBe(new Date(start).getTime());
  });

  it("lets a live subscription (the upgrade) take the row over", async () => {
    const owner = await signUpTestUser("owner");
    const companyId = await createCompany(owner.cookieHeader, "Free Upgrade Event Co");
    await seedFree(companyId, new Date());

    const lookupKey = getPlan("pro").stripeLookupKey!;
    expect(await postEvent(subscriptionEvent("customer.subscription.updated", companyId, "active", lookupKey))).toBe(200);

    const billing = await readBilling(companyId);
    expect(billing.plan_key).toBe("pro");
    expect(billing.stripe_subscription_id).toBe(`sub_free_${companyId}_active`);
    expect((await usageRow(companyId, billing.current_period_start as string))?.reply_limit).toBe(
      getPlan("pro").monthlyReplyLimit,
    );
  });
});
