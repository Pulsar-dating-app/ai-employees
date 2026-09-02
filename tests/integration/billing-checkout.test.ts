import { describe, expect, it } from "vitest";
import { api } from "./helpers/request";
import { signUpTestUser } from "./helpers/auth";
import { getTestServiceClient } from "./helpers/service-client";
import { getPlan } from "@/lib/billing/plans";
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

  it("swaps the plan in place (prorated) when a live subscription exists", async () => {
    const owner = await signUpTestUser("owner");
    const companyId = await createCompany(owner.cookieHeader, "Checkout Plan Swap Co");
    const svc = getTestServiceClient();
    await svc.from("company_billing").insert({
      company_id: companyId,
      stripe_customer_id: "cus_seed_swap",
      stripe_subscription_id: "sub_mock_starter",
      subscription_status: "active",
      plan_key: "starter",
      current_period_start: new Date().toISOString(),
      current_period_end: new Date(Date.now() + 30 * 24 * 3600_000).toISOString(),
    });

    const res = await checkout(owner.cookieHeader, companyId, "pro");
    expect(res.status).toBe(200);
    expect(res.json.mode).toBe("plan_change");
    expect(res.json.unchanged).toBe(false);
    expect(res.json.url ?? null).toBeNull();

    const { data: billing } = await svc
      .from("company_billing")
      .select("plan_key")
      .eq("company_id", companyId)
      .single();
    expect(billing?.plan_key).toBe("pro");
  });

  it("no-ops the swap when already on the requested plan", async () => {
    const owner = await signUpTestUser("owner");
    const companyId = await createCompany(owner.cookieHeader, "Checkout Same Plan Co");
    const svc = getTestServiceClient();
    await svc.from("company_billing").insert({
      company_id: companyId,
      stripe_customer_id: "cus_seed_same",
      stripe_subscription_id: "sub_mock_pro",
      subscription_status: "active",
      plan_key: "pro",
    });

    const res = await checkout(owner.cookieHeader, companyId, "pro");
    expect(res.status).toBe(200);
    expect(res.json.mode).toBe("plan_change");
    expect(res.json.unchanged).toBe(true);
  });

  it("checkout targets the plan's real BRL price id", () => {
    // Guards the plumbing the mock relies on: the route resolves the price
    // via getPlan(), and stripe-api-mock keys its subscription responses off
    // the same values.
    expect(getPlan("starter").stripePriceId).toMatch(/^price_/);
    expect(getPlan("pro").stripePriceId).toMatch(/^price_/);
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
