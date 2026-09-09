import { describe, expect, it } from "vitest";
import { api } from "./helpers/request";
import { signUpTestUser } from "./helpers/auth";
import { getTestServiceClient } from "./helpers/service-client";
import { capturedCheckoutSession } from "./helpers/stripe-checkout-sessions";
import { getPlan, TRIAL_DAYS } from "@/lib/billing/plans";
import { isBillingActive } from "@/lib/billing/activation";

// Trello P3 -- POST /api/companies/[companyId]/billing/checkout, against the
// local Stripe mock (helpers/stripe-api-mock.ts, wired in global-setup.ts).
// The mock is stateless: "no currency param" is proven by the mock 400ing
// any session create that carries one, so a passing checkout IS that
// assertion.

async function createCompany(ownerCookie: string, name: string) {
  const created = await api<{ company: { id: string } }>("POST", "/api/companies", ownerCookie, { name });
  return created.json.company.id;
}

function checkout(cookie: string | undefined, companyId: string, planKey: unknown) {
  return api<{ ok: boolean; mode: string; url: string | null; planKey?: string; unchanged?: boolean; code?: string }>(
    "POST",
    `/api/companies/${companyId}/billing/checkout`,
    cookie,
    { planKey },
  );
}

describe("Plan checkout (Trello P3)", () => {
  it("requires authentication", async () => {
    const owner = await signUpTestUser("owner");
    const companyId = await createCompany(owner.cookieHeader, "Checkout Auth Co");
    expect((await checkout(undefined, companyId, "starter")).status).toBe(401);
  });

  it("is admin-gated — a plain member can't start a subscription", async () => {
    const owner = await signUpTestUser("owner");
    const member = await signUpTestUser("member");
    const companyId = await createCompany(owner.cookieHeader, "Checkout Admin Gate Co");
    await api("POST", `/api/companies/${companyId}/members`, owner.cookieHeader, {
      userId: member.userId,
      role: "member",
    });

    const res = await checkout(member.cookieHeader, companyId, "starter");
    expect(res.status).toBe(403);
  });

  it("rejects the enterprise plan with a contact-only code", async () => {
    const owner = await signUpTestUser("owner");
    const companyId = await createCompany(owner.cookieHeader, "Checkout Enterprise Co");

    const res = await checkout(owner.cookieHeader, companyId, "enterprise");
    expect(res.status).toBe(400);
    expect(res.json.code).toBe("enterprise_contact_only");
  });

  it("rejects an unknown plan key", async () => {
    const owner = await signUpTestUser("owner");
    const companyId = await createCompany(owner.cookieHeader, "Checkout Bad Plan Co");
    expect((await checkout(owner.cookieHeader, companyId, "gold")).status).toBe(400);
  });

  it("creates a Checkout Session for Starter and stubs company_billing (no currency param)", async () => {
    const owner = await signUpTestUser("owner");
    const companyId = await createCompany(owner.cookieHeader, "Checkout Starter Co");

    const res = await checkout(owner.cookieHeader, companyId, "starter");
    expect(res.status).toBe(200);
    expect(res.json.mode).toBe("checkout");
    expect(res.json.url).toMatch(/^https:\/\/checkout\.stripe\.test\/c\//);

    const svc = getTestServiceClient();
    const { data: billing } = await svc
      .from("company_billing")
      .select("stripe_customer_id, plan_key, subscription_status, stripe_subscription_id")
      .eq("company_id", companyId)
      .single();
    expect(billing?.stripe_customer_id).toMatch(/^cus_mock/);
    expect(billing?.plan_key).toBe("starter");
    expect(billing?.subscription_status).toBe("incomplete");
    expect(billing?.stripe_subscription_id).toBeNull();
  });

  it("reuses the same Stripe Customer on a second checkout", async () => {
    const owner = await signUpTestUser("owner");
    const companyId = await createCompany(owner.cookieHeader, "Checkout Customer Reuse Co");
    const svc = getTestServiceClient();

    await checkout(owner.cookieHeader, companyId, "starter");
    const { data: first } = await svc
      .from("company_billing")
      .select("stripe_customer_id")
      .eq("company_id", companyId)
      .single();

    await checkout(owner.cookieHeader, companyId, "pro");
    const { data: second } = await svc
      .from("company_billing")
      .select("stripe_customer_id")
      .eq("company_id", companyId)
      .single();

    expect(second?.stripe_customer_id).toBe(first?.stripe_customer_id);
  });

  it("sends an existing subscriber to the Stripe Billing Portal, leaving company_billing untouched", async () => {
    const owner = await signUpTestUser("owner");
    const companyId = await createCompany(owner.cookieHeader, "Checkout Portal Co");
    const svc = getTestServiceClient();
    await svc.from("company_billing").insert({
      company_id: companyId,
      stripe_customer_id: "cus_seed_portal",
      stripe_subscription_id: "sub_mock_starter",
      subscription_status: "active",
      plan_key: "starter",
      current_period_start: new Date().toISOString(),
      current_period_end: new Date(Date.now() + 30 * 24 * 3600_000).toISOString(),
    });

    const res = await checkout(owner.cookieHeader, companyId, "pro");
    expect(res.status).toBe(200);
    expect(res.json.mode).toBe("portal");
    expect(res.json.url).toMatch(/^https:\/\/billing\.stripe\.test\/p\/session\//);

    // The plan swap happens on the Portal; P4's webhook is what writes
    // company_billing. This route must not touch it.
    const { data: billing } = await svc
      .from("company_billing")
      .select("plan_key, subscription_status")
      .eq("company_id", companyId)
      .single();
    expect(billing?.plan_key).toBe("starter");
    expect(billing?.subscription_status).toBe("active");
  });

  it("returns the Portal for an existing subscriber even with no planKey in the body", async () => {
    const owner = await signUpTestUser("owner");
    const companyId = await createCompany(owner.cookieHeader, "Checkout Portal No Key Co");
    const svc = getTestServiceClient();
    await svc.from("company_billing").insert({
      company_id: companyId,
      stripe_customer_id: "cus_seed_portal_nokey",
      stripe_subscription_id: "sub_mock_pro",
      subscription_status: "active",
      plan_key: "pro",
    });

    const res = await api<{ mode: string; url: string }>(
      "POST",
      `/api/companies/${companyId}/billing/checkout`,
      owner.cookieHeader,
      {},
    );
    expect(res.status).toBe(200);
    expect(res.json.mode).toBe("portal");
  });

  it("checkout targets the plan's real BRL price id", () => {
    // Guards the plumbing the mock relies on: the route resolves the price
    // via getPlan().
    expect(getPlan("starter").stripePriceId).toMatch(/^price_/);
    expect(getPlan("pro").stripePriceId).toMatch(/^price_/);
  });

  // A completed checkout whose `checkout.session.completed` webhook never
  // landed leaves company_billing on the P3 stub (`incomplete`, no
  // subscription id) while Stripe already has a live subscription. The
  // route reconciles from Stripe before deciding checkout-vs-portal.
  describe("reconcile — a lost checkout.session.completed webhook", () => {
    it("adopts the customer's live subscription and returns the Portal instead of a second checkout", async () => {
      const owner = await signUpTestUser("owner");
      const companyId = await createCompany(owner.cookieHeader, "Checkout Reconcile Co");
      const svc = getTestServiceClient();
      await svc.from("company_billing").insert({
        company_id: companyId,
        // Mock: this customer id shape means "Stripe has a live starter sub".
        stripe_customer_id: `cus_livesub_starter__co_${companyId}`,
        subscription_status: "incomplete",
        plan_key: "starter",
      });

      const res = await checkout(owner.cookieHeader, companyId, "pro");
      expect(res.status).toBe(200);
      expect(res.json.mode).toBe("portal");

      const { data: billing } = await svc
        .from("company_billing")
        .select("subscription_status, stripe_subscription_id, plan_key, current_period_start")
        .eq("company_id", companyId)
        .single();
      expect(billing?.subscription_status).toBe("active");
      expect(billing?.stripe_subscription_id).toBe(`sub_mock_starter__co_${companyId}`);
      expect(billing?.plan_key).toBe("starter");

      // The synced period opened a usage row.
      const { data: usage } = await svc
        .from("company_message_usage")
        .select("replies_used, reply_limit")
        .eq("company_id", companyId)
        .eq("period_start", billing!.current_period_start as string)
        .single();
      expect(usage?.replies_used).toBe(0);
      expect(usage?.reply_limit).toBe(getPlan("starter").monthlyReplyLimit);
    });

    it("re-syncs a stale plan_key after a Portal upgrade whose webhook was lost", async () => {
      const owner = await signUpTestUser("owner");
      const companyId = await createCompany(owner.cookieHeader, "Checkout Reconcile Upgrade Co");
      const svc = getTestServiceClient();
      // We recorded Starter, but the sub id points at a Pro subscription --
      // the merchant switched plans on the Portal and the
      // customer.subscription.updated never arrived.
      await svc.from("company_billing").insert({
        company_id: companyId,
        stripe_customer_id: "cus_upgrade",
        stripe_subscription_id: `sub_mock_pro__co_${companyId}`,
        subscription_status: "active",
        plan_key: "starter",
      });

      const res = await checkout(owner.cookieHeader, companyId, "pro");
      expect(res.status).toBe(200);
      expect(res.json.mode).toBe("portal");

      const { data: billing } = await svc
        .from("company_billing")
        .select("plan_key, subscription_status")
        .eq("company_id", companyId)
        .single();
      expect(billing?.plan_key).toBe("pro");
      expect(billing?.subscription_status).toBe("active");
    });

    it("still mints a checkout when the customer genuinely has no live subscription", async () => {
      const owner = await signUpTestUser("owner");
      const companyId = await createCompany(owner.cookieHeader, "Checkout Reconcile Noop Co");
      const svc = getTestServiceClient();
      await svc.from("company_billing").insert({
        company_id: companyId,
        stripe_customer_id: "cus_no_live_sub",
        subscription_status: "incomplete",
        plan_key: "starter",
      });

      const res = await checkout(owner.cookieHeader, companyId, "starter");
      expect(res.status).toBe(200);
      expect(res.json.mode).toBe("checkout");

      const { data: billing } = await svc
        .from("company_billing")
        .select("subscription_status")
        .eq("company_id", companyId)
        .single();
      expect(billing?.subscription_status).toBe("incomplete");
    });
  });

  describe("POST /billing/portal (Trello P5 — Manage billing)", () => {
    it("requires an admin and a Stripe customer on record", async () => {
      const owner = await signUpTestUser("owner");
      const member = await signUpTestUser("member");
      const companyId = await createCompany(owner.cookieHeader, "Portal Route Co");
      await api("POST", `/api/companies/${companyId}/members`, owner.cookieHeader, {
        userId: member.userId,
        role: "member",
      });
      const svc = getTestServiceClient();

      // unauthenticated
      expect(
        (await api("POST", `/api/companies/${companyId}/billing/portal`, undefined, {})).status,
      ).toBe(401);
      // plain member
      expect(
        (await api("POST", `/api/companies/${companyId}/billing/portal`, member.cookieHeader, {})).status,
      ).toBe(403);
      // admin, but no billing row yet
      const noAccount = await api<{ code?: string }>(
        "POST",
        `/api/companies/${companyId}/billing/portal`,
        owner.cookieHeader,
        {},
      );
      expect(noAccount.status).toBe(400);
      expect(noAccount.json.code).toBe("no_billing_account");

      // admin, with a customer on record
      await svc.from("company_billing").insert({
        company_id: companyId,
        stripe_customer_id: "cus_portal_route",
        plan_key: "starter",
        subscription_status: "active",
      });
      const ok = await api<{ url: string }>(
        "POST",
        `/api/companies/${companyId}/billing/portal`,
        owner.cookieHeader,
        {},
      );
      expect(ok.status).toBe(200);
      expect(ok.json.url).toMatch(/^https:\/\/billing\.stripe\.test\/p\/session\//);
    });
  });

  describe("Free trial -- Starter and Pro (Trello P8)", () => {
    it.each(["starter", "pro"] as const)(
      "grants a trial on a first checkout of %s",
      async (planKey) => {
        const owner = await signUpTestUser("owner");
        const companyId = await createCompany(owner.cookieHeader, `Trial First Checkout ${planKey} Co`);

        const res = await checkout(owner.cookieHeader, companyId, planKey);
        expect(res.status).toBe(200);
        expect(res.json.mode).toBe("checkout");

        const session = await capturedCheckoutSession(res.json.url!);
        expect(session?.trialPeriodDays).toBe(TRIAL_DAYS);
        expect(session?.metadata.trialUserId).toBe(owner.userId);
      },
    );

    it("does not grant a second trial once the user's trial_used_at is set", async () => {
      const owner = await signUpTestUser("owner");
      const companyId = await createCompany(owner.cookieHeader, "Trial Already Used Co");
      const svc = getTestServiceClient();
      await svc.from("users").update({ trial_used_at: new Date().toISOString() }).eq("id", owner.userId);

      const res = await checkout(owner.cookieHeader, companyId, "starter");
      expect(res.status).toBe(200);
      expect(res.json.mode).toBe("checkout");

      const session = await capturedCheckoutSession(res.json.url!);
      expect(session?.trialPeriodDays).toBeNull();
      expect(session?.metadata.trialUserId).toBeUndefined();
    });

    // The trial is one per account, not one per plan -- using it on Starter
    // must not leave a second one available on Pro.
    it("a trial used on Starter isn't available again on Pro", async () => {
      const owner = await signUpTestUser("owner");
      const companyId = await createCompany(owner.cookieHeader, "Trial Cross Plan Co");
      const svc = getTestServiceClient();
      await svc.from("users").update({ trial_used_at: new Date().toISOString() }).eq("id", owner.userId);

      const res = await checkout(owner.cookieHeader, companyId, "pro");
      expect(res.status).toBe(200);

      const session = await capturedCheckoutSession(res.json.url!);
      expect(session?.trialPeriodDays).toBeNull();
      expect(session?.metadata.trialUserId).toBeUndefined();
    });

    it("never grants a trial on Enterprise", () => {
      // No self-serve Checkout exists for Enterprise (400 enterprise_contact_only,
      // asserted elsewhere) -- this just pins the catalog data the eligibility
      // check relies on, since there's no checkout call to make here.
      expect(getPlan("enterprise").trialReplyLimit).toBeNull();
    });

    // Two different users, same company: the trial is a property of the
    // person checking out, not the plan choice or the company.
    it("a second admin of the same company still gets their own trial", async () => {
      const owner = await signUpTestUser("owner");
      const admin = await signUpTestUser("admin");
      const companyId = await createCompany(owner.cookieHeader, "Trial Per User Co");
      await api("POST", `/api/companies/${companyId}/members`, owner.cookieHeader, {
        userId: admin.userId,
        role: "admin",
      });
      const svc = getTestServiceClient();
      await svc.from("users").update({ trial_used_at: new Date().toISOString() }).eq("id", owner.userId);

      const res = await checkout(admin.cookieHeader, companyId, "starter");
      expect(res.status).toBe(200);

      const session = await capturedCheckoutSession(res.json.url!);
      expect(session?.trialPeriodDays).toBe(TRIAL_DAYS);
      expect(session?.metadata.trialUserId).toBe(admin.userId);
    });

    // A trialing subscriber can switch plans same as any other live one --
    // Stripe's own default Portal behavior ends the trial and charges the
    // new plan in full immediately (verified against Stripe's docs), so
    // there's no free-quota loophole here worth blocking. See
    // stripe-webhook.test.ts for the (defensive-only) webhook-side guard
    // against a future Portal config where a switch preserves the trial
    // instead of ending it.
    it("routes a trialing subscriber's plan switch to the Portal like any other live subscription", async () => {
      const owner = await signUpTestUser("owner");
      const companyId = await createCompany(owner.cookieHeader, "Trial Switch Co");
      const svc = getTestServiceClient();
      // `__trial` in the sub id is what the mock needs to keep reporting
      // "trialing" on the reconcile check the route runs before deciding
      // checkout-vs-portal -- otherwise it "corrects" the row to the mock's
      // default `active` status before this test ever gets to assert anything.
      await svc.from("company_billing").insert({
        company_id: companyId,
        stripe_customer_id: "cus_trial_switch",
        stripe_subscription_id: `sub_mock_starter__co_${companyId}__trial`,
        subscription_status: "trialing",
        plan_key: "starter",
        current_period_start: new Date().toISOString(),
      });

      const res = await checkout(owner.cookieHeader, companyId, "pro");
      expect(res.status).toBe(200);
      expect(res.json.mode).toBe("portal");

      // The swap happens on the Portal; this route never touches
      // company_billing on this path (P4's webhook is the only writer).
      const { data: billing } = await svc
        .from("company_billing")
        .select("plan_key, subscription_status")
        .eq("company_id", companyId)
        .single();
      expect(billing?.plan_key).toBe("starter");
      expect(billing?.subscription_status).toBe("trialing");
    });
  });

  describe("POST /billing/end-trial (Trello P8 -- convert to paid before the trial ends)", () => {
    it("requires authentication and admin", async () => {
      const owner = await signUpTestUser("owner");
      const member = await signUpTestUser("member");
      const companyId = await createCompany(owner.cookieHeader, "End Trial Auth Co");
      await api("POST", `/api/companies/${companyId}/members`, owner.cookieHeader, {
        userId: member.userId,
        role: "member",
      });

      expect(
        (await api("POST", `/api/companies/${companyId}/billing/end-trial`, undefined, {})).status,
      ).toBe(401);
      expect(
        (await api("POST", `/api/companies/${companyId}/billing/end-trial`, member.cookieHeader, {})).status,
      ).toBe(403);
    });

    it("refuses when there's no active trial", async () => {
      const owner = await signUpTestUser("owner");
      const svc = getTestServiceClient();

      const noRow = await createCompany(owner.cookieHeader, "End Trial No Row Co");
      const resNoRow = await api(
        "POST",
        `/api/companies/${noRow}/billing/end-trial`,
        owner.cookieHeader,
        {},
      );
      expect(resNoRow.status).toBe(400);
      expect((resNoRow.json as { code?: string }).code).toBe("no_active_trial");

      const owner2 = await signUpTestUser("owner2");
      const activeCo = await createCompany(owner2.cookieHeader, "End Trial Already Active Co");
      await svc.from("company_billing").insert({
        company_id: activeCo,
        stripe_customer_id: "cus_end_trial_active",
        stripe_subscription_id: "sub_mock_starter",
        subscription_status: "active",
        plan_key: "starter",
      });
      const resActive = await api(
        "POST",
        `/api/companies/${activeCo}/billing/end-trial`,
        owner2.cookieHeader,
        {},
      );
      expect(resActive.status).toBe(400);
      expect((resActive.json as { code?: string }).code).toBe("no_active_trial");
    });

    it("ends the trial early on a valid trialing subscription", async () => {
      const owner = await signUpTestUser("owner");
      const companyId = await createCompany(owner.cookieHeader, "End Trial Success Co");
      const svc = getTestServiceClient();
      await svc.from("company_billing").insert({
        company_id: companyId,
        stripe_customer_id: "cus_end_trial_ok",
        stripe_subscription_id: `sub_mock_starter__co_${companyId}__trial`,
        subscription_status: "trialing",
        plan_key: "starter",
        current_period_start: new Date().toISOString(),
      });

      const res = await api<{ ok: boolean }>(
        "POST",
        `/api/companies/${companyId}/billing/end-trial`,
        owner.cookieHeader,
        {},
      );
      expect(res.status).toBe(200);
      expect(res.json.ok).toBe(true);
    });

    it("returns 502 when Stripe refuses to end the trial (e.g. the card fails)", async () => {
      const owner = await signUpTestUser("owner");
      const companyId = await createCompany(owner.cookieHeader, "End Trial Failure Co");
      const svc = getTestServiceClient();
      await svc.from("company_billing").insert({
        company_id: companyId,
        stripe_customer_id: "cus_end_trial_fail",
        stripe_subscription_id: "sub_mock_starter__trigger-end-trial-failure",
        subscription_status: "trialing",
        plan_key: "starter",
        current_period_start: new Date().toISOString(),
      });

      const res = await api<{ code?: string }>(
        "POST",
        `/api/companies/${companyId}/billing/end-trial`,
        owner.cookieHeader,
        {},
      );
      expect(res.status).toBe(502);
      expect(res.json.code).toBe("end_trial_failed");
    });
  });

  describe("isBillingActive stub (wired as a real gate in P6)", () => {
    it("is true only for an active/trialing subscription row", async () => {
      const owner = await signUpTestUser("owner");
      const companyId = await createCompany(owner.cookieHeader, "Billing Active Helper Co");
      const svc = getTestServiceClient();

      expect(await isBillingActive(companyId, svc)).toBe(false);

      await svc.from("company_billing").insert({
        company_id: companyId,
        plan_key: "starter",
        subscription_status: "incomplete",
      });
      expect(await isBillingActive(companyId, svc)).toBe(false);

      await svc
        .from("company_billing")
        .update({ subscription_status: "active" })
        .eq("company_id", companyId);
      expect(await isBillingActive(companyId, svc)).toBe(true);
    });
  });
});
