import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { api } from "./helpers/request";
import { signUpTestUser } from "./helpers/auth";
import { seedActivePlan } from "./helpers/billing";

// Trello N1. company_instagram_connections.access_token is column-locked
// (migration 20260831140200), and (2026-09-22) insert/update/delete are
// locked to the service role entirely -- every real write goes through the
// connect/disconnect routes' service-role client, so the row here is created
// through the real connect endpoint, then probed directly via supabase-js.
// Same style as company-whatsapp-connections-rls.test.ts and
// company-calendar-connections-rls.test.ts.
//
// The unique-index business rules this file used to prove via raw inserts
// (one account per agent, one account per company platform-wide, freed on
// disconnect) predate the real connect route (see this file's own history)
// and are now exercised end-to-end through it instead --
// instagram-connection.test.ts's "refuses to connect an account another
// agent in the SAME company already holds, then moves it with force" and
// "refuses to connect an account a DIFFERENT company holds, even with
// force" cover the same underlying constraints via the only path that can
// reach them in production.
describe("company_instagram_connections RLS: access_token is column-locked, writes are service-role-only", () => {
  async function hireAgent(ownerCookie: string, companyId: string, agentSlug: string) {
    await seedActivePlan(companyId); // P6: the hire POST needs an active plan
    await api("POST", `/api/companies/${companyId}/agents/${agentSlug}`, ownerCookie);
  }

  it("blocks even the company owner from selecting, inserting, or updating access_token directly", async () => {
    const owner = await signUpTestUser("owner");

    const created = await api<{ company: { id: string } }>(
      "POST",
      "/api/companies",
      owner.cookieHeader,
      { name: "Instagram Connections RLS Co" },
    );
    const companyId = created.json.company.id;
    await hireAgent(owner.cookieHeader, companyId, "malu");

    // The mock derives the stored account id from the code -- unique per
    // test so repeated runs never collide on the platform-wide index.
    const connected = await api(
      "POST",
      `/api/companies/${companyId}/agents/malu/instagram/connect`,
      owner.cookieHeader,
      { code: `rls-lock-${randomUUID().slice(0, 8)}` },
    );
    expect(connected.status).toBe(200);

    // Safe columns remain normally readable -- RLS's is_company_member
    // still governs the row, only access_token is locked.
    const safeSelect = await owner.client
      .from("company_instagram_connections")
      .select("instagram_user_id, username, status")
      .eq("company_id", companyId);
    expect(safeSelect.error).toBeNull();
    expect(safeSelect.data).toHaveLength(1);

    const tokenSelect = await owner.client
      .from("company_instagram_connections")
      .select("access_token")
      .eq("company_id", companyId);
    expect(tokenSelect.error?.code).toBe("42501");

    const tokenUpdate = await owner.client
      .from("company_instagram_connections")
      .update({ access_token: "hijacked" })
      .eq("company_id", companyId)
      .select();
    expect(tokenUpdate.error?.code).toBe("42501");

    const tokenInsert = await owner.client
      .from("company_instagram_connections")
      .insert({ company_id: companyId, instagram_user_id: "fake", username: "@fake", access_token: "hijacked" })
      .select();
    expect(tokenInsert.error?.code).toBe("42501");
  });

  // 2026-09-22 -- proves the direct-RLS bypass is closed on safe columns
  // too, not just access_token (see decisions.md).
  it("blocks a direct insert/update on safe columns too, not just access_token", async () => {
    const owner = await signUpTestUser("owner");
    const created = await api<{ company: { id: string } }>(
      "POST",
      "/api/companies",
      owner.cookieHeader,
      { name: "Instagram Direct Write Bypass Co" },
    );
    const companyId = created.json.company.id;
    await hireAgent(owner.cookieHeader, companyId, "malu");
    const { data: agentRow } = await owner.client.from("agents").select("id").eq("slug", "malu").single();

    const fakeInsert = await owner.client
      .from("company_instagram_connections")
      .insert({
        company_id: companyId,
        agent_id: (agentRow as { id: string }).id,
        instagram_user_id: `fake-bypass-${randomUUID().slice(0, 8)}`,
        username: "@fake-bypass",
        status: "connected",
      })
      .select();
    expect(fakeInsert.error?.code).toBe("42501");

    const fakeUpdate = await owner.client
      .from("company_instagram_connections")
      .update({ status: "connected" })
      .eq("company_id", companyId)
      .select();
    expect(fakeUpdate.error?.code).toBe("42501");
  });

  it("denies a non-member from reading another company's connection", async () => {
    const owner = await signUpTestUser("owner");
    const outsider = await signUpTestUser("outsider");
    const created = await api<{ company: { id: string } }>(
      "POST",
      "/api/companies",
      owner.cookieHeader,
      { name: "Instagram Private Co" },
    );
    const companyId = created.json.company.id;
    await hireAgent(owner.cookieHeader, companyId, "malu");
    await api(
      "POST",
      `/api/companies/${companyId}/agents/malu/instagram/connect`,
      owner.cookieHeader,
      { code: `rls-private-${randomUUID().slice(0, 8)}` },
    );

    // RLS SELECT denial reads as an empty result set, not an error.
    const read = await outsider.client
      .from("company_instagram_connections")
      .select("id")
      .eq("company_id", companyId);
    expect(read.error).toBeNull();
    expect(read.data).toEqual([]);
  });
});
