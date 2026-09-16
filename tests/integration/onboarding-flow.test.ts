import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { api } from "./helpers/request";
import { signUpTestUser, type TestUser } from "./helpers/auth";
import { getTestServiceClient } from "./helpers/service-client";
import { seedActivePlan } from "./helpers/billing";
import { getTestEnv } from "./helpers/env";

// The first session's four steps, walked over real HTTP. Every step page is a
// Server Component that redirects when the merchant has not reached it yet, so
// these assertions cover both that the pages render at all (a build does not
// prove that for dynamic routes) and that the guards cannot be skipped.
describe("Onboarding flow", () => {
  async function page(path: string, cookie: string) {
    const { baseUrl } = getTestEnv();
    const res = await fetch(baseUrl + path, { headers: { cookie }, redirect: "manual" });
    const location = res.headers.get("location");
    const html = res.status === 200 ? await res.text() : "";

    // A missing message key does not throw and does not fail the request:
    // next-intl logs it and renders the key path as literal text, so a page
    // can 200 while showing "Onboarding.rail.done" to the merchant. Asserting
    // status alone missed exactly that. Every render in this file is checked.
    const leaked = html.match(/Onboarding\.[A-Za-z.]+/);
    if (leaked) throw new Error(`Unresolved message key rendered on ${path}: ${leaked[0]}`);

    return {
      status: res.status,
      // Next redirects a Server Component via 307 + location.
      redirectedTo: location ? new URL(location, baseUrl).pathname : null,
      html,
    };
  }

  async function createCompany(user: TestUser) {
    const created = await api<{ company: { id: string } }>("POST", "/api/companies", user.cookieHeader, {
      name: `Onboarding Co ${randomUUID().slice(0, 8)}`,
    });
    return created.json.company.id;
  }

  async function hire(user: TestUser, companyId: string, slug: string) {
    await seedActivePlan(companyId);
    await api("POST", `/api/companies/${companyId}/agents/${slug}`, user.cookieHeader, {});
  }

  it("sends a brand-new account to step 1 and renders it", async () => {
    const owner = await signUpTestUser("owner");

    const step1 = await page("/onboarding", owner.cookieHeader);
    expect(step1.status).toBe(200);

    // Skipping ahead bounces back to the step they are actually on.
    for (const path of ["/onboarding/hire", "/onboarding/setup", "/onboarding/ready"]) {
      const res = await page(path, owner.cookieHeader);
      expect(res.redirectedTo).toBe("/onboarding");
    }
  });

  it("moves to the hire step once a company exists, and renders both agents", async () => {
    const owner = await signUpTestUser("owner");
    await createCompany(owner);

    const step1 = await page("/onboarding", owner.cookieHeader);
    expect(step1.redirectedTo).toBe("/onboarding/hire");

    const hirePage = await page("/onboarding/hire", owner.cookieHeader);
    expect(hirePage.status).toBe(200);
    expect(hirePage.html).toContain("Malu");
    expect(hirePage.html).toContain("Ana");

    for (const path of ["/onboarding/setup", "/onboarding/ready"]) {
      const res = await page(path, owner.cookieHeader);
      expect(res.redirectedTo).toBe("/onboarding/hire");
    }
  });

  it("gives a sales hire the catalogue step, not the services one", async () => {
    const owner = await signUpTestUser("owner");
    const companyId = await createCompany(owner);
    await hire(owner, companyId, "malu");

    const setup = await page("/onboarding/setup", owner.cookieHeader);
    expect(setup.status).toBe(200);
    // The Shopify form's own action, i.e. real rendered DOM -- asserting on
    // copy would pass on next-intl's serialized message payload, which carries
    // every namespace regardless of which branch actually rendered.
    expect(setup.html).toContain("shopify/connect/start");

    // No catalogue yet, so the proof step is not reachable.
    const ready = await page("/onboarding/ready", owner.cookieHeader);
    expect(ready.redirectedTo).toBe("/onboarding/setup");
  });

  it("gives a scheduling hire the services step, not the catalogue one", async () => {
    const owner = await signUpTestUser("owner");
    const companyId = await createCompany(owner);
    await hire(owner, companyId, "ana");

    const setup = await page("/onboarding/setup", owner.cookieHeader);
    expect(setup.status).toBe(200);
    expect(setup.html).not.toContain("shopify/connect/start");
    // The trade picker is a plain group, not a radiogroup: choosing one
    // advances the screen, so nothing is left checked to describe.
    expect(setup.html).toContain('role="group"');

    const ready = await page("/onboarding/ready", owner.cookieHeader);
    expect(ready.redirectedTo).toBe("/onboarding/setup");
  });

  // Leaving and coming back is the normal case, not the exception: the flow
  // has an import and a chat in it, and people close tabs.
  it("puts a merchant who left mid-flow back on the step they stopped on", async () => {
    const owner = await signUpTestUser("owner");

    // Stopped after naming the business.
    const companyId = await createCompany(owner);
    expect((await page("/dashboard", owner.cookieHeader)).redirectedTo).toBe("/onboarding/hire");

    // Stopped after hiring.
    await hire(owner, companyId, "malu");
    expect((await page("/dashboard", owner.cookieHeader)).redirectedTo).toBe("/onboarding/setup");

    // Stopped with a catalogue imported but the proof never seen.
    await api("POST", `/api/companies/${companyId}/products`, owner.cookieHeader, {
      name: "Camiseta Tie Dye",
      price: 51.79,
      currency: "BRL",
    });
    expect((await page("/dashboard", owner.cookieHeader)).redirectedTo).toBe("/onboarding/ready");
  });

  it("lets a finished merchant into the dashboard, and does not bounce them", async () => {
    const owner = await signUpTestUser("owner");
    const companyId = await createCompany(owner);
    await getTestServiceClient()
      .from("companies")
      .update({ onboarding_completed_at: new Date().toISOString() })
      .eq("id", companyId);

    // Opting out is a real exit -- otherwise the dashboard redirect above and
    // the flow's own "later" button would bounce a merchant between them.
    expect((await page("/dashboard", owner.cookieHeader)).status).toBe(200);
  });

  // The toggle asks the reply gate, so a merchant still inside the free first
  // session can pause and unpause their own hire; finishing without paying is
  // what closes it.
  it("allows the toggle during the first session and closes it once the flow ends", async () => {
    const owner = await signUpTestUser("owner");
    const companyId = await createCompany(owner);
    await api("POST", `/api/companies/${companyId}/agents/malu`, owner.cookieHeader, {});

    const duringPause = await api("PATCH", `/api/companies/${companyId}/agents/malu`, owner.cookieHeader, {
      status: "paused",
    });
    expect(duringPause.status).toBe(200);

    const duringResume = await api("PATCH", `/api/companies/${companyId}/agents/malu`, owner.cookieHeader, {
      status: "active",
    });
    expect(duringResume.status).toBe(200);

    await getTestServiceClient()
      .from("companies")
      .update({ onboarding_completed_at: new Date().toISOString() })
      .eq("id", companyId);

    const afterPause = await api("PATCH", `/api/companies/${companyId}/agents/malu`, owner.cookieHeader, {
      status: "paused",
    });
    expect(afterPause.status).toBe(200);

    const afterResume = await api<{ error: string }>(
      "PATCH",
      `/api/companies/${companyId}/agents/malu`,
      owner.cookieHeader,
      { status: "active" },
    );
    expect(afterResume.status).toBe(402);
    expect(afterResume.json.error).toBe("plan_required");
  });

  it("never shows the flow again once the merchant has finished it", async () => {
    const owner = await signUpTestUser("owner");
    const companyId = await createCompany(owner);
    await hire(owner, companyId, "malu");
    await api("POST", `/api/companies/${companyId}/products`, owner.cookieHeader, {
      name: "Camiseta Tie Dye",
      price: 51.79,
      currency: "BRL",
    });

    // Reaching the last step is not finishing it; leaving it is.
    expect((await page("/onboarding/ready", owner.cookieHeader)).status).toBe(200);

    await getTestServiceClient()
      .from("companies")
      .update({ onboarding_completed_at: new Date().toISOString() })
      .eq("id", companyId);

    for (const path of ["/onboarding", "/onboarding/hire", "/onboarding/setup", "/onboarding/ready"]) {
      const res = await page(path, owner.cookieHeader);
      expect(res.redirectedTo).toBe("/dashboard");
    }
  });

  it("does not drag a finished merchant back in when their catalogue empties", async () => {
    const owner = await signUpTestUser("owner");
    const companyId = await createCompany(owner);
    await hire(owner, companyId, "malu");

    await getTestServiceClient()
      .from("companies")
      .update({ onboarding_completed_at: new Date().toISOString() })
      .eq("id", companyId);

    // No products at all, which without the stored flag would resolve to the
    // setup step and pull them back through a flow they already completed.
    const res = await page("/onboarding/setup", owner.cookieHeader);
    expect(res.redirectedTo).toBe("/dashboard");
  });

  it("does not count the trigger-seeded default service as a configured business", async () => {
    const owner = await signUpTestUser("owner");
    const companyId = await createCompany(owner);
    await hire(owner, companyId, "ana");

    const svc = getTestServiceClient();
    const { data: seeded } = await svc
      .from("services")
      .select("id, is_default, is_active")
      .eq("company_id", companyId);

    // The trigger really did seed one, so this test is exercising the case.
    expect((seeded ?? []).some((s) => (s as { is_default: boolean }).is_default)).toBe(true);

    // Even switched on, the catch-all must not stand in for a real service list.
    await svc.from("services").update({ is_active: true }).eq("company_id", companyId).eq("is_default", true);

    const ready = await page("/onboarding/ready", owner.cookieHeader);
    expect(ready.redirectedTo).toBe("/onboarding/setup");
  });

  it("opens the proof step once the hire can actually work", async () => {
    const owner = await signUpTestUser("owner");
    const companyId = await createCompany(owner);
    await hire(owner, companyId, "malu");

    await api("POST", `/api/companies/${companyId}/products`, owner.cookieHeader, {
      name: "Camiseta Tie Dye",
      price: 51.79,
      currency: "BRL",
    });

    const ready = await page("/onboarding/ready", owner.cookieHeader);
    expect(ready.status).toBe(200);
    // The suggestion chips are seeded from a real row, which is the whole point.
    expect(ready.html).toContain("Camiseta Tie Dye");
  });

  it("keeps one merchant's first session out of another's", async () => {
    const [a, b] = await Promise.all([signUpTestUser("a"), signUpTestUser("b")]);
    const companyId = await createCompany(a);
    await hire(a, companyId, "malu");

    // B has no company at all and must not inherit A's progress.
    const bStep = await page("/onboarding/setup", b.cookieHeader);
    expect(bStep.redirectedTo).toBe("/onboarding");
  });
});
