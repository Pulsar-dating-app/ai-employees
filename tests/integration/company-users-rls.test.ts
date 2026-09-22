import { describe, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { signUpTestUser } from "./helpers/auth";
import { getTestEnv } from "./helpers/env";

// Exercises the company_users RLS policies directly via PostgREST, bypassing
// the Next.js API entirely -- these are the exact bugs found while manually
// testing A3: an admin was able to remove/promote an owner via a raw table
// call, which no amount of testing the API routes alone would have caught.
describe("company_users RLS: owner role protection", () => {
  it("blocks an admin from deleting or promoting-to-owner, but allows normal admin actions", async () => {
    const owner = await signUpTestUser("owner");
    const admin = await signUpTestUser("admin");
    const target = await signUpTestUser("target");

    const { data: company, error: createError } = await owner.client.rpc("create_company_with_owner", {
      company_name: "RLS Test Co",
      company_email: null,
      company_phone: null,
      company_website_url: null,
      company_description: null,
      company_currency: null,
      company_country: null,
      company_timezone: null,
    });
    expect(createError).toBeNull();
    const companyId = company.id as string;

    await owner.client.from("company_users").insert({ company_id: companyId, user_id: admin.userId, role: "admin" });
    await owner.client.from("company_users").insert({ company_id: companyId, user_id: target.userId, role: "member" });

    const deleteOwner = await admin.client
      .from("company_users")
      .delete()
      .eq("company_id", companyId)
      .eq("user_id", owner.userId)
      .select();
    expect(deleteOwner.data).toEqual([]);

    const promoteToOwner = await admin.client
      .from("company_users")
      .update({ role: "owner" })
      .eq("company_id", companyId)
      .eq("user_id", target.userId)
      .select();
    expect(promoteToOwner.error).not.toBeNull();
    expect(promoteToOwner.error?.code).toBe("42501");

    const promoteToAdmin = await admin.client
      .from("company_users")
      .update({ role: "admin" })
      .eq("company_id", companyId)
      .eq("user_id", target.userId)
      .select();
    expect(promoteToAdmin.error).toBeNull();
    expect(promoteToAdmin.data).toHaveLength(1);
  });

  // 2026-09-22 -- CRITICAL. The INSERT policy's `user_id = auth.uid()`
  // branch (meant for a self-join flow that doesn't actually exist anywhere
  // in this codebase -- grep-verified) never constrained `role`, so any
  // authenticated stranger could self-insert into ANY company as its
  // 'owner'. Fixed by dropping that branch entirely (migration
  // 20260922110000) -- every insert now requires private.is_company_admin,
  // same as the promote/remove protections above. See decisions.md.
  it("blocks a stranger from self-joining any company, at any role", async () => {
    const owner = await signUpTestUser("owner");
    const stranger = await signUpTestUser("stranger");

    const { data: company, error: createError } = await owner.client.rpc("create_company_with_owner", {
      company_name: "Self Join Target Co",
      company_email: null,
      company_phone: null,
      company_website_url: null,
      company_description: null,
      company_currency: null,
      company_country: null,
      company_timezone: null,
    });
    expect(createError).toBeNull();
    const companyId = company.id as string;

    for (const role of ["owner", "admin", "member"] as const) {
      const selfJoin = await stranger.client
        .from("company_users")
        .insert({ company_id: companyId, user_id: stranger.userId, role })
        .select();
      expect(selfJoin.error).not.toBeNull();
      expect(selfJoin.error?.code).toBe("42501");
    }

    const membership = await owner.client
      .from("company_users")
      .select("user_id")
      .eq("company_id", companyId);
    expect(membership.data).toEqual([{ user_id: owner.userId }]);
  });

  it("blocks anon from calling create_company_with_owner directly", async () => {
    const { supabaseUrl, anonKey } = getTestEnv();
    const anon = createClient(supabaseUrl, anonKey);

    const { error } = await anon.rpc("create_company_with_owner", {
      company_name: "Should Not Exist",
      company_email: null,
      company_phone: null,
      company_website_url: null,
      company_description: null,
      company_currency: null,
      company_country: null,
      company_timezone: null,
    });

    expect(error).not.toBeNull();
    expect(error?.code).toBe("42501");
  });
});
