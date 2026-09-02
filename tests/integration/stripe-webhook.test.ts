import { beforeAll, describe, expect, it } from "vitest";
import Stripe from "stripe";
import { getTestEnv } from "./helpers/env";
import { getTestServiceClient } from "./helpers/service-client";
import { api } from "./helpers/request";
import { signUpTestUser } from "./helpers/auth";
import { getPlan } from "@/lib/billing/plans";
import { isBillingLapsed } from "@/lib/billing/activation";

// Trello P4 -- POST /api/webhooks/stripe. Synthetic events are signed with
// the same STRIPE_WEBHOOK_SECRET literal global-setup.ts hands the spawned
// next server, so constructEvent() accepts them. The Stripe API mock
// (stripe-api-mock.ts) answers the subscriptions.retrieve() calls the
// checkout.session.completed / invoice.paid handlers make.

const WEBHOOK_SECRET = "whsec_test_secret";
const signer = new Stripe("sk_test_ignored");

let baseUrl: string;
beforeAll(() => {
  baseUrl = getTestEnv().baseUrl;
});

function unix(offsetMs = 0): number {
  return Math.floor((Date.now() + offsetMs) / 1000);
}

function stripeEvent(type: string, object: Record<string, unknown>, id = `evt_${crypto.randomUUID()}`) {
  return { id, object: "event", api_version: "2026-08-26.dahlia", created: unix(), type, data: { object } };
}

function subscriptionObject(opts: {
  id: string;
  companyId: string;
  status: string;
  lookupKey: string | null;
  periodStartSec: number;
  cancelAtPeriodEnd?: boolean;
  customer?: string;
}) {
  return {
    id: opts.id,
    object: "subscription",
    status: opts.status,
    cancel_at_period_end: opts.cancelAtPeriodEnd ?? false,
    customer: opts.customer ?? `cus_${opts.companyId}`,
    metadata: { companyId: opts.companyId },
    items: {
      object: "list",
      data: [
        {
          id: "si_evt_1",
          object: "subscription_item",
          current_period_start: opts.periodStartSec,
          current_period_end: opts.periodStartSec + 30 * 24 * 3600,
          price: { object: "price", id: "price_evt_1", lookup_key: opts.lookupKey },
        },
      ],
    },
  };
}

async function postEvent(event: object, overrideSignature?: string) {
  const payload = JSON.stringify(event);
  const signature =
    overrideSignature ?? signer.webhooks.generateTestHeaderString({ payload, secret: WEBHOOK_SECRET });
  const res = await fetch(`${baseUrl}/api/webhooks/stripe`, {
    method: "POST",
    headers: { "content-type": "application/json", "stripe-signature": signature },
    body: payload,
  });
  const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  return { status: res.status, json };
}

async function createCompany(name: string) {
  const owner = await signUpTestUser("owner");
  const created = await api<{ company: { id: string } }>("POST", "/api/companies", owner.cookieHeader, { name });
  return created.json.company.id;
}

const svc = getTestServiceClient();

async function readBilling(companyId: string) {
  const { data } = await svc
    .from("company_billing")
    .select("stripe_subscription_id, subscription_status, plan_key, current_period_start")
    .eq("company_id", companyId)
    .maybeSingle();
  return data;
}

describe("Stripe webhook (Trello P4)", () => {
  it("rejects an invalid signature with 400", async () => {
    const res = await postEvent(stripeEvent("customer.subscription.updated", { id: "sub_x" }), "t=1,v1=deadbeef");
    expect(res.status).toBe(400);
  });

  it("checkout.session.completed provisions billing + the first usage row", async () => {
    const companyId = await createCompany("P4 Provision Co");

    const event = stripeEvent("checkout.session.completed", {
      id: "cs_provision",
      object: "checkout.session",
      metadata: { companyId, planKey: "starter" },
      customer: "cus_provision",
      subscription: `sub_mock_starter__co_${companyId}`,
    });
    const res = await postEvent(event);
    expect(res.status).toBe(200);
    expect(res.json?.received).toBe(true);

    const billing = await readBilling(companyId);
    expect(billing?.stripe_subscription_id).toBe(`sub_mock_starter__co_${companyId}`);
    expect(billing?.subscription_status).toBe("active");
    expect(billing?.plan_key).toBe("starter");
    expect(billing?.current_period_start).toBeTruthy();

    const { data: usage } = await svc
      .from("company_message_usage")
      .select("replies_used, reply_limit, period_start")
      .eq("company_id", companyId);
    expect(usage).toHaveLength(1);
    expect(usage![0].replies_used).toBe(0);
    expect(usage![0].reply_limit).toBe(getPlan("starter").monthlyReplyLimit);

    // The event is recorded as fully processed (processed_at stamped).
    const { data: eventRow } = await svc
      .from("stripe_webhook_events")
      .select("processed_at, type")
      .eq("event_id", event.id)
      .single();
    expect(eventRow?.type).toBe("checkout.session.completed");
    expect(eventRow?.processed_at).toBeTruthy();
  });

  it("is idempotent — a repeat delivery of the same event id is a no-op 200", async () => {
    const companyId = await createCompany("P4 Idempotent Co");
    await svc.from("company_billing").insert({
      company_id: companyId,
      stripe_customer_id: "cus_idem",
      stripe_subscription_id: "sub_idem",
      subscription_status: "active",
      plan_key: "starter",
      current_period_start: new Date().toISOString(),
    });

    const event = stripeEvent(
      "customer.subscription.updated",
      subscriptionObject({
        id: "sub_idem",
        companyId,
        status: "past_due",
        lookupKey: "starter_monthly",
        periodStartSec: unix(),
      }),
      `evt_idem_${crypto.randomUUID()}`,
    );

    const first = await postEvent(event);
    expect(first.status).toBe(200);
    expect(first.json?.deduped).toBeUndefined();

    const second = await postEvent(event);
    expect(second.status).toBe(200);
    expect(second.json?.deduped).toBe(true);
  });

  it("customer.subscription.updated → past_due syncs the status without a rollover", async () => {
    const companyId = await createCompany("P4 PastDue Co");
    const periodStart = new Date();
    await svc.from("company_billing").insert({
      company_id: companyId,
      stripe_customer_id: "cus_pd",
      stripe_subscription_id: "sub_pd",
      subscription_status: "active",
      plan_key: "starter",
      current_period_start: periodStart.toISOString(),
    });

    const res = await postEvent(
      stripeEvent(
        "customer.subscription.updated",
        subscriptionObject({
          id: "sub_pd",
          companyId,
          status: "past_due",
          lookupKey: "starter_monthly",
          periodStartSec: Math.floor(periodStart.getTime() / 1000),
        }),
      ),
    );
    expect(res.status).toBe(200);

    expect((await readBilling(companyId))?.subscription_status).toBe("past_due");
    const { data: usage } = await svc.from("company_message_usage").select("id").eq("company_id", companyId);
    expect(usage ?? []).toHaveLength(0);
  });

  it("a new billing period opens a fresh usage row, leaving the old one intact", async () => {
    const companyId = await createCompany("P4 Rollover Co");
    const t0 = new Date("2026-06-01T00:00:00Z");
    await svc.from("company_billing").insert({
      company_id: companyId,
      stripe_customer_id: "cus_roll",
      stripe_subscription_id: "sub_roll",
      subscription_status: "active",
      plan_key: "pro",
      current_period_start: t0.toISOString(),
    });
    await svc.from("company_message_usage").insert({
      company_id: companyId,
      period_start: t0.toISOString(),
      replies_used: 500,
      reply_limit: getPlan("pro").monthlyReplyLimit,
    });

    const t1Sec = Math.floor(new Date("2026-07-01T00:00:00Z").getTime() / 1000);
    const res = await postEvent(
      stripeEvent(
        "customer.subscription.updated",
        subscriptionObject({
          id: "sub_roll",
          companyId,
          status: "active",
          lookupKey: "pro_monthly",
          periodStartSec: t1Sec,
        }),
      ),
    );
    expect(res.status).toBe(200);

    const { data: rows } = await svc
      .from("company_message_usage")
      .select("period_start, replies_used")
      .eq("company_id", companyId)
      .order("period_start", { ascending: true });
    expect(rows).toHaveLength(2);
    expect(rows![0].replies_used).toBe(500); // old period untouched
    expect(rows![1].replies_used).toBe(0); // new period reset
    expect(new Date(rows![1].period_start).getTime()).toBe(t1Sec * 1000);
  });

  it("plan change on a new period updates plan_key from the price lookup_key", async () => {
    const companyId = await createCompany("P4 PlanChange Co");
    const t0 = new Date("2026-06-15T00:00:00Z");
    await svc.from("company_billing").insert({
      company_id: companyId,
      stripe_customer_id: "cus_pc",
      stripe_subscription_id: "sub_pc",
      subscription_status: "active",
      plan_key: "starter",
      current_period_start: t0.toISOString(),
    });

    await postEvent(
      stripeEvent(
        "customer.subscription.updated",
        subscriptionObject({
          id: "sub_pc",
          companyId,
          status: "active",
          lookupKey: "pro_monthly",
          periodStartSec: Math.floor(new Date("2026-07-15T00:00:00Z").getTime() / 1000),
        }),
      ),
    );

    expect((await readBilling(companyId))?.plan_key).toBe("pro");
  });

  it("an unknown price lookup_key keeps the existing plan_key but still syncs status", async () => {
    const companyId = await createCompany("P4 Unknown Key Co");
    await svc.from("company_billing").insert({
      company_id: companyId,
      stripe_customer_id: "cus_uk",
      stripe_subscription_id: "sub_uk",
      subscription_status: "active",
      plan_key: "pro",
      current_period_start: new Date().toISOString(),
    });

    await postEvent(
      stripeEvent(
        "customer.subscription.updated",
        subscriptionObject({
          id: "sub_uk",
          companyId,
          status: "past_due",
          lookupKey: "legacy_unrecognised_key",
          periodStartSec: unix(),
        }),
      ),
    );

    const billing = await readBilling(companyId);
    expect(billing?.plan_key).toBe("pro"); // untouched
    expect(billing?.subscription_status).toBe("past_due"); // rest still ran
  });

  it("customer.subscription.deleted marks the plan canceled", async () => {
    const companyId = await createCompany("P4 Cancel Co");
    await svc.from("company_billing").insert({
      company_id: companyId,
      stripe_customer_id: "cus_cx",
      stripe_subscription_id: "sub_cx",
      subscription_status: "active",
      plan_key: "starter",
      current_period_start: new Date().toISOString(),
    });

    await postEvent(
      stripeEvent(
        "customer.subscription.deleted",
        subscriptionObject({
          id: "sub_cx",
          companyId,
          status: "canceled",
          lookupKey: "starter_monthly",
          periodStartSec: unix(),
        }),
      ),
    );

    expect((await readBilling(companyId))?.subscription_status).toBe("canceled");
  });

  it("invoice.paid brings a past_due company back to active", async () => {
    const companyId = await createCompany("P4 Recover Co");
    const subId = `sub_mock_pro__co_${companyId}`;
    await svc.from("company_billing").insert({
      company_id: companyId,
      stripe_customer_id: "cus_rec",
      stripe_subscription_id: subId,
      subscription_status: "past_due",
      plan_key: "pro",
      current_period_start: new Date().toISOString(),
    });

    const res = await postEvent(
      stripeEvent("invoice.paid", {
        id: "in_recover",
        object: "invoice",
        parent: {
          type: "subscription_details",
          subscription_details: { subscription: subId },
        },
      }),
    );
    expect(res.status).toBe(200);
    expect((await readBilling(companyId))?.subscription_status).toBe("active");
  });

  it("checkout.session.completed cancels a superseded live subscription", async () => {
    const companyId = await createCompany("P4 Double Sub Co");
    await svc.from("company_billing").insert({
      company_id: companyId,
      stripe_customer_id: "cus_ds",
      stripe_subscription_id: `sub_mock_starter__co_${companyId}`,
      subscription_status: "active",
      plan_key: "starter",
      current_period_start: new Date().toISOString(),
    });

    const newSubId = `sub_mock_pro__co_${companyId}`;
    const res = await postEvent(
      stripeEvent("checkout.session.completed", {
        id: "cs_double",
        object: "checkout.session",
        metadata: { companyId },
        customer: "cus_ds",
        subscription: newSubId,
      }),
    );
    expect(res.status).toBe(200);

    const billing = await readBilling(companyId);
    expect(billing?.stripe_subscription_id).toBe(newSubId);
    expect(billing?.plan_key).toBe("pro");
  });

  describe("isBillingLapsed (the reply gate predicate)", () => {
    it("is true for a company whose subscription is not active/trialing, false otherwise", async () => {
      const companyId = await createCompany("P4 Lapsed Predicate Co");

      expect(await isBillingLapsed(companyId, svc)).toBe(false); // no row -> P6's problem, not a lapse

      await svc.from("company_billing").insert({
        company_id: companyId,
        stripe_customer_id: "cus_lp",
        subscription_status: "active",
        plan_key: "starter",
      });
      expect(await isBillingLapsed(companyId, svc)).toBe(false);

      for (const status of ["past_due", "unpaid", "canceled", "incomplete"]) {
        await svc.from("company_billing").update({ subscription_status: status }).eq("company_id", companyId);
        expect(await isBillingLapsed(companyId, svc), status).toBe(true);
      }
    });
  });
});
