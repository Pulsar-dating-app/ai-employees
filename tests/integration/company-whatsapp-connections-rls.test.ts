import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { api } from "./helpers/request";
import { signUpTestUser } from "./helpers/auth";
import { seedActivePlan } from "./helpers/billing";

// Trello ticket D1. company_whatsapp_connections.access_token is locked
// down with column-level privileges (migration 20260826104820), not a
// separate table -- this proves that lockdown holds at the database level
// via direct PostgREST (bypassing the Next.js app entirely), not just
// because the app's own routes never select/write the column. Same style
// as company-users-rls.test.ts. The row is created through the real
// connect endpoint (the only legitimate way one gets created) and then
// probed directly via supabase-js.
describe("company_whatsapp_connections RLS: access_token is column-locked for every authenticated role", () => {
  it("blocks even the company owner from selecting, inserting, or updating access_token directly", async () => {
    const owner = await signUpTestUser("owner");

    const created = await api<{ company: { id: string } }>(
      "POST",
      "/api/companies",
      owner.cookieHeader,
      { name: "Connections RLS Co" },
    );
    const companyId = created.json.company.id;

    // The WhatsApp add-on is required to connect (2026-09-22) -- this test
    // is about access_token's RLS lockdown, not entitlement, so it just
    // needs a plan the connect route will actually accept.
    await seedActivePlan(companyId, { planKey: "starter_wpp" });
    await api("POST", `/api/companies/${companyId}/agents/malu`, owner.cookieHeader);

    const unique = randomUUID().slice(0, 8);
    const connected = await api(
      "POST",
      `/api/companies/${companyId}/agents/malu/whatsapp/connect`,
      owner.cookieHeader,
      { code: "good-code", phoneNumberId: `phone-${unique}`, wabaId: `waba-${unique}` },
    );
    expect(connected.status).toBe(200);

    // Safe columns remain normally readable -- RLS's is_company_member
    // still governs the row, only the access_token column is locked.
    const safeSelect = await owner.client
      .from("company_whatsapp_connections")
      .select("phone_number_id, status")
      .eq("company_id", companyId);
    expect(safeSelect.error).toBeNull();
    expect(safeSelect.data).toHaveLength(1);

    const tokenSelect = await owner.client
      .from("company_whatsapp_connections")
      .select("access_token")
      .eq("company_id", companyId);
    expect(tokenSelect.error).not.toBeNull();
    expect(tokenSelect.error?.code).toBe("42501");

    const tokenUpdate = await owner.client
      .from("company_whatsapp_connections")
      .update({ access_token: "hijacked" })
      .eq("company_id", companyId)
      .select();
    expect(tokenUpdate.error).not.toBeNull();
    expect(tokenUpdate.error?.code).toBe("42501");

    const tokenInsert = await owner.client
      .from("company_whatsapp_connections")
      .insert({
        company_id: companyId,
        phone_number_id: "fake",
        waba_id: "fake",
        access_token: "hijacked",
      })
      .select();
    expect(tokenInsert.error).not.toBeNull();
    expect(tokenInsert.error?.code).toBe("42501");
  });

  // 2026-09-22 -- every write to this table (connect, disconnect, the D5
  // payment-issue flip, the eligibility cron) already went through the
  // service-role client, but the original migration still left insert/
  // update/delete grants + "Company admins can ..." policies open to the
  // regular authenticated client -- a company admin could reach this table
  // directly via PostgREST/supabase-js, bypassing the Next.js connect
  // route's WhatsApp add-on entitlement gate entirely, and write a row with
  // status "connected" straight past it. Migration
  // 20260922100000_lock_writes_to_whatsapp_connections.sql closed that --
  // this proves it at the database level, on safe columns only (no
  // access_token, which the test above already covers separately).
  it("blocks a direct insert/update on safe columns too, not just access_token", async () => {
    const owner = await signUpTestUser("owner");

    const created = await api<{ company: { id: string } }>(
      "POST",
      "/api/companies",
      owner.cookieHeader,
      { name: "Direct Write Bypass Co" },
    );
    const companyId = created.json.company.id;
    await seedActivePlan(companyId, { planKey: "starter" }); // deliberately no WhatsApp add-on
    await api("POST", `/api/companies/${companyId}/agents/malu`, owner.cookieHeader);

    const fakeInsert = await owner.client
      .from("company_whatsapp_connections")
      .insert({ company_id: companyId, phone_number_id: "fake-bypass", waba_id: "fake-bypass", status: "connected" })
      .select();
    expect(fakeInsert.error).not.toBeNull();
    expect(fakeInsert.error?.code).toBe("42501");

    const fakeUpdate = await owner.client
      .from("company_whatsapp_connections")
      .update({ status: "connected" })
      .eq("company_id", companyId)
      .select();
    expect(fakeUpdate.error).not.toBeNull();
    expect(fakeUpdate.error?.code).toBe("42501");
  });
});
