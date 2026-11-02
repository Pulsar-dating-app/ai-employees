import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { api } from "./helpers/request";
import { signUpTestUser, type TestUser } from "./helpers/auth";
import { getTestServiceClient } from "./helpers/service-client";
import { seedActivePlan } from "./helpers/billing";
import { getTestEnv } from "./helpers/env";

// The two cards that lead the dashboard for a merchant who finished
// onboarding but hasn't put their hire to work (2026-10-26): "not answering
// anyone yet" on the home page, until a channel is live, and the quick
// questions on Settings, until enough of the business is written down.
describe("Dashboard go-live and quick setup cards", () => {
  async function render(path: string, cookie: string) {
    const { baseUrl } = getTestEnv();
    const res = await fetch(baseUrl + path, { headers: { cookie }, redirect: "manual" });
    const html = res.status === 200 ? await res.text() : "";
    const leaked = html.match(/(Dashboard|Settings|ShareLink|Welcome)\.[A-Za-z.]+/);
    if (leaked) throw new Error(`Unresolved message key rendered on ${path}: ${leaked[0]}`);
    return { status: res.status, html };
  }

  async function finishedCompanyWithAna(user: TestUser) {
    const created = await api<{ company: { id: string; slug: string } }>("POST", "/api/companies", user.cookieHeader, {
      name: `Go Live Co ${randomUUID().slice(0, 8)}`,
    });
    const companyId = created.json.company.id;
    await seedActivePlan(companyId);
    await api("POST", `/api/companies/${companyId}/agents/ana`, user.cookieHeader, {});
    await getTestServiceClient()
      .from("companies")
      .update({ onboarding_completed_at: new Date().toISOString() })
      .eq("id", companyId);
    const { data } = await getTestServiceClient().from("companies").select("slug").eq("id", companyId).single();
    return { companyId, slug: (data as { slug: string }).slug };
  }

  it("leads the home page with the hire's link until a channel is live", async () => {
    const owner = await signUpTestUser("go-live-home");
    const { companyId, slug } = await finishedCompanyWithAna(owner);

    const before = await render("/dashboard", owner.cookieHeader);
    expect(before.status).toBe(200);
    expect(before.html).toContain(`/talk/${slug}/ana`);
    expect(before.html).toContain("/dashboard/my-agents/ana?canal=instagram");
    // Business details are optional: the home page doesn't ask for them.
    expect(before.html).not.toContain('id="quick-teach-description"');

    // An allowed embed site is one of the checklist's "channel live" facts.
    await getTestServiceClient()
      .from("companies")
      .update({ allowed_embed_domains: ["example.com"] })
      .eq("id", companyId);

    const after = await render("/dashboard", owner.cookieHeader);
    expect(after.status).toBe(200);
    expect(after.html).not.toContain("/dashboard/my-agents/ana?canal=instagram");
  });

  it("shows the welcome page: she's answering, and where to find everything", async () => {
    const owner = await signUpTestUser("go-live-welcome");
    const { companyId } = await finishedCompanyWithAna(owner);
    await getTestServiceClient().from("company_instagram_connections").insert({
      company_id: companyId,
      agent_id: (
        (await getTestServiceClient().from("agents").select("id").eq("slug", "ana").single()).data as { id: string }
      ).id,
      instagram_user_id: `igsid_${randomUUID()}`,
      username: "studio.welcome",
      status: "connected",
    });

    const welcome = await render("/dashboard/welcome", owner.cookieHeader);
    expect(welcome.status).toBe(200);
    expect(welcome.html).toContain("studio.welcome");
    expect(welcome.html).toContain('href="/dashboard/conversations"');
    expect(welcome.html).toContain('href="/dashboard/scheduling"');
    expect(welcome.html).toContain('href="/dashboard/my-agents/ana"');
    expect(welcome.html).toContain('href="/dashboard/settings"');

    // Back on the home page, the "not answering anyone yet" card is gone.
    const home = await render("/dashboard", owner.cookieHeader);
    expect(home.status).toBe(200);
    expect(home.html).not.toContain('id="go-live-title"');
    expect(home.html).not.toContain("/dashboard/my-agents/ana?canal=instagram");
  });

  it("asks the quick questions on Settings until enough is filled in", async () => {
    const owner = await signUpTestUser("go-live-settings");
    const { companyId } = await finishedCompanyWithAna(owner);

    const before = await render("/dashboard/settings", owner.cookieHeader);
    expect(before.status).toBe(200);
    expect(before.html).toContain('id="quick-teach-description"');

    // What the card saves: the same columns the full form edits.
    const saved = await api("PATCH", `/api/companies/${companyId}`, owner.cookieHeader, {
      description: "Barbearia no centro, só com horário marcado.",
      payment_policy: "Formas de pagamento: Pix e Dinheiro.",
      address: "Rua das Flores, 10",
    });
    expect(saved.status).toBe(200);

    const after = await render("/dashboard/settings?pronto=1", owner.cookieHeader);
    expect(after.status).toBe(200);
    expect(after.html).not.toContain('id="quick-teach-description"');
    expect(after.html).toContain("Barbearia no centro");
  });
});
