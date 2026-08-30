import { describe, expect, it } from "vitest";
import { api } from "./helpers/request";
import { signUpTestUser } from "./helpers/auth";

// Trello ticket I1. company_calendar_connections.access_token/refresh_token
// are locked down with column-level privileges (migration 20260829201627),
// not a separate table -- this proves that lockdown holds at the database
// level via direct PostgREST (bypassing the Next.js app entirely), not just
// because the app's own routes never select/write either column. Same style
// as company-whatsapp-connections-rls.test.ts. The row is created through
// the real connect endpoint (the only legitimate way one gets created) and
// then probed directly via supabase-js.
describe("company_calendar_connections RLS: access_token/refresh_token are column-locked for every authenticated role", () => {
  it("blocks even the company owner from selecting, inserting, or updating either token column directly", async () => {
    const owner = await signUpTestUser("owner");

    const created = await api<{ company: { id: string } }>(
      "POST",
      "/api/companies",
      owner.cookieHeader,
      { name: "Calendar Connections RLS Co" },
    );
    const companyId = created.json.company.id;

    const connected = await api(
      "POST",
      `/api/companies/${companyId}/calendar/connect`,
      owner.cookieHeader,
      { code: "good-code" },
    );
    expect(connected.status).toBe(200);

    // Safe columns remain normally readable -- RLS's is_company_member
    // still governs the row, only the two token columns are locked.
    const safeSelect = await owner.client
      .from("company_calendar_connections")
      .select("provider, status")
      .eq("company_id", companyId);
    expect(safeSelect.error).toBeNull();
    expect(safeSelect.data).toHaveLength(1);

    for (const column of ["access_token", "refresh_token"] as const) {
      const select = await owner.client
        .from("company_calendar_connections")
        .select(column)
        .eq("company_id", companyId);
      expect(select.error).not.toBeNull();
      expect(select.error?.code).toBe("42501");

      const update = await owner.client
        .from("company_calendar_connections")
        .update({ [column]: "hijacked" })
        .eq("company_id", companyId)
        .select();
      expect(update.error).not.toBeNull();
      expect(update.error?.code).toBe("42501");
    }

    const insert = await owner.client
      .from("company_calendar_connections")
      .insert({
        company_id: companyId,
        access_token: "hijacked",
        refresh_token: "hijacked",
      })
      .select();
    expect(insert.error).not.toBeNull();
    expect(insert.error?.code).toBe("42501");
  });
});
