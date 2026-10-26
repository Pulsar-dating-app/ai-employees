import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { api } from "./helpers/request";
import { signUpTestUser, type TestUser } from "./helpers/auth";
import { getTestServiceClient } from "./helpers/service-client";
import { getTestEnv } from "./helpers/env";

// funnel_events (2026-10-26) is insert-only for merchants, as themselves,
// into their own company; only the service role reads it.
describe("Funnel events", () => {
  async function createCompany(user: TestUser) {
    const created = await api<{ company: { id: string } }>("POST", "/api/companies", user.cookieHeader, {
      name: `Funnel Co ${randomUUID().slice(0, 8)}`,
    });
    return created.json.company.id;
  }

  async function eventsFor(companyId: string) {
    const { data } = await getTestServiceClient()
      .from("funnel_events")
      .select("event, properties, user_id")
      .eq("company_id", companyId);
    return (data ?? []) as { event: string; properties: Record<string, unknown>; user_id: string }[];
  }

  it("lets a member record an event for their own company, and nothing else", async () => {
    const [owner, stranger] = await Promise.all([signUpTestUser("funnel-owner"), signUpTestUser("funnel-stranger")]);
    const companyId = await createCompany(owner);

    const own = await owner.client
      .from("funnel_events")
      .insert({ company_id: companyId, user_id: owner.userId, event: "link_copied", properties: { surface: "home" } });
    expect(own.error).toBeNull();

    // Into someone else's company, or as someone else: refused by RLS.
    const foreign = await stranger.client
      .from("funnel_events")
      .insert({ company_id: companyId, user_id: stranger.userId, event: "link_copied" });
    expect(foreign.error?.code).toBe("42501");
    const impersonated = await stranger.client
      .from("funnel_events")
      .insert({ company_id: null, user_id: owner.userId, event: "app_opened" });
    expect(impersonated.error?.code).toBe("42501");

    // Nobody reads it back through the API.
    const read = await owner.client.from("funnel_events").select("event").eq("company_id", companyId);
    expect(read.data ?? []).toHaveLength(0);

    expect(await eventsFor(companyId)).toEqual([
      { event: "link_copied", properties: { surface: "home" }, user_id: owner.userId },
    ]);
  });

  it("records a nudge e-mail click and forwards to the dashboard", async () => {
    const owner = await signUpTestUser("funnel-click");
    const companyId = await createCompany(owner);
    const { baseUrl } = getTestEnv();

    const res = await fetch(`${baseUrl}/api/nudges/click?k=not_live`, {
      headers: { cookie: owner.cookieHeader },
      redirect: "manual",
    });
    expect(res.status).toBe(307);
    expect(new URL(res.headers.get("location")!, baseUrl).pathname).toBe("/dashboard");
    expect(await eventsFor(companyId)).toEqual([
      { event: "nudge_clicked", properties: { kind: "not_live" }, user_id: owner.userId },
    ]);

    // An unknown kind is forwarded without recording anything.
    await fetch(`${baseUrl}/api/nudges/click?k=bogus`, { headers: { cookie: owner.cookieHeader }, redirect: "manual" });
    expect(await eventsFor(companyId)).toHaveLength(1);
  });
});
