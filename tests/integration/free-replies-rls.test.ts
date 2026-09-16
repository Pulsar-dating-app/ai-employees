import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { api } from "./helpers/request";
import { signUpTestUser } from "./helpers/auth";
import { getTestServiceClient } from "./helpers/service-client";
import { seedActivePlan } from "./helpers/billing";

// The two columns that decide whether replies are free. RLS on `companies`
// restricts by ROW, not by column, and an admin can update their own company
// through a direct PostgREST call that never touches this app's routes -- so
// without the column-privilege lockdown a merchant could clear
// onboarding_completed_at to reopen the free window, or zero
// free_replies_used to refill it, forever. This proves the lockdown holds at
// the database level, bypassing the app entirely.
describe("companies: the pre-plan columns are not merchant-writable", () => {
  async function ownedCompany(owner: Awaited<ReturnType<typeof signUpTestUser>>) {
    const created = await api<{ company: { id: string } }>("POST", "/api/companies", owner.cookieHeader, {
      name: `Free Replies Co ${randomUUID().slice(0, 8)}`,
    });
    return created.json.company.id;
  }

  it("blocks the owner from clearing onboarding_completed_at or zeroing the counter", async () => {
    const owner = await signUpTestUser("owner");
    const companyId = await ownedCompany(owner);

    const svc = getTestServiceClient();
    await svc
      .from("companies")
      .update({ onboarding_completed_at: new Date().toISOString(), free_replies_used: 20 })
      .eq("id", companyId);

    // Ordinary columns stay writable -- this is a column lock, not a wall.
    const rename = await owner.client
      .from("companies")
      .update({ name: "Renamed By Owner" })
      .eq("id", companyId)
      .select();
    expect(rename.error).toBeNull();

    const reopen = await owner.client
      .from("companies")
      .update({ onboarding_completed_at: null })
      .eq("id", companyId)
      .select();
    expect(reopen.error).not.toBeNull();
    expect(reopen.error?.code).toBe("42501");

    const refill = await owner.client
      .from("companies")
      .update({ free_replies_used: 0 })
      .eq("id", companyId)
      .select();
    expect(refill.error).not.toBeNull();
    expect(refill.error?.code).toBe("42501");

    // And neither actually moved.
    const { data } = await svc
      .from("companies")
      .select("onboarding_completed_at, free_replies_used")
      .eq("id", companyId)
      .single();
    const row = data as { onboarding_completed_at: string | null; free_replies_used: number };
    expect(row.onboarding_completed_at).not.toBeNull();
    expect(row.free_replies_used).toBe(20);
  });

  it("does not let a merchant call the counter's RPC at all", async () => {
    const owner = await signUpTestUser("owner");
    const companyId = await ownedCompany(owner);

    const direct = await owner.client.rpc("record_free_reply", { p_company_id: companyId });
    expect(direct.error).not.toBeNull();
  });

  it("counts a free reply only while the company has no billing row", async () => {
    const owner = await signUpTestUser("owner");
    const companyId = await ownedCompany(owner);
    const svc = getTestServiceClient();

    await svc.rpc("record_free_reply", { p_company_id: companyId });
    await svc.rpc("record_free_reply", { p_company_id: companyId });

    const { data: counted } = await svc
      .from("companies")
      .select("free_replies_used")
      .eq("id", companyId)
      .single();
    expect((counted as { free_replies_used: number }).free_replies_used).toBe(2);

    // Once they are paying, record_ai_reply owns the counting and this one
    // must stop, rather than double-counting the same reply.
    await seedActivePlan(companyId);
    await svc.rpc("record_free_reply", { p_company_id: companyId });

    const { data: after } = await svc
      .from("companies")
      .select("free_replies_used")
      .eq("id", companyId)
      .single();
    expect((after as { free_replies_used: number }).free_replies_used).toBe(2);
  });
});
