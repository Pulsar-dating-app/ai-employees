import { describe, expect, it } from "vitest";
import { api } from "./helpers/request";
import { signUpTestUser } from "./helpers/auth";

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

    const connected = await api(
      "POST",
      `/api/companies/${companyId}/whatsapp/connect`,
      owner.cookieHeader,
      { code: "good-code", phoneNumberId: "1234567890", wabaId: "0987654321" },
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
});
