import { describe, expect, it } from "vitest";
import { api } from "./helpers/request";
import { signUpTestUser, type TestUser } from "./helpers/auth";

// Trello N1 -- company_instagram_connections has no HTTP route yet (N2 adds
// the connect flow), so this drives PostgREST directly, bypassing the
// Next.js app entirely. Same style as company-whatsapp-connections-rls.test.ts
// and messages-rls.test.ts.
//
// Two separate guarantees are under test here:
//   1. access_token is column-locked, exactly as D1's is.
//   2. one Instagram account answers exactly one agent -- the rule N4's
//      webhook depends on, since it can only identify the business by that
//      account id.
describe("company_instagram_connections", () => {
  async function createCompany(ownerCookie: string, name: string) {
    const created = await api<{ company: { id: string } }>("POST", "/api/companies", ownerCookie, { name });
    return created.json.company.id;
  }

  // Two real, active agents exist (malu, ana) -- the per-agent connection
  // rule is meaningless with only one, so read both rather than hardcoding
  // ids that a seed change would invalidate.
  async function agentIds(user: TestUser) {
    const { data, error } = await user.client.from("agents").select("id, slug").in("slug", ["malu", "ana"]);
    if (error) throw error;
    const rows = data as { id: string; slug: string }[];
    const malu = rows.find((row) => row.slug === "malu");
    const ana = rows.find((row) => row.slug === "ana");
    if (!malu || !ana) throw new Error(`expected malu and ana in agents, got ${rows.map((r) => r.slug).join(",")}`);
    return { malu: malu.id, ana: ana.id };
  }

  function connectionRow(companyId: string, agentId: string, account: string) {
    return {
      company_id: companyId,
      agent_id: agentId,
      instagram_user_id: account,
      username: `@${account}`,
      status: "connected" as const,
    };
  }

  it("blocks even the company owner from selecting, inserting, or updating access_token directly", async () => {
    const owner = await signUpTestUser("owner");
    const companyId = await createCompany(owner.cookieHeader, "Instagram Lock Co");
    const { malu } = await agentIds(owner);

    const insert = await owner.client.from("company_instagram_connections").insert(connectionRow(companyId, malu, "ig_lock_acct"));
    expect(insert.error).toBeNull();

    // Every other column stays normally readable -- is_company_member still
    // governs the row, only access_token is locked.
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
      .insert({ ...connectionRow(companyId, malu, "ig_lock_acct_2"), access_token: "hijacked" })
      .select();
    expect(tokenInsert.error?.code).toBe("42501");
  });

  it("denies a non-member from reading or connecting for another company", async () => {
    const owner = await signUpTestUser("owner");
    const outsider = await signUpTestUser("outsider");
    const companyId = await createCompany(owner.cookieHeader, "Instagram Private Co");
    const { malu, ana } = await agentIds(owner);

    await owner.client.from("company_instagram_connections").insert(connectionRow(companyId, malu, "ig_private_acct"));

    // RLS SELECT denial reads as an empty result set, not an error.
    const read = await outsider.client
      .from("company_instagram_connections")
      .select("id")
      .eq("company_id", companyId);
    expect(read.error).toBeNull();
    expect(read.data).toEqual([]);

    const insert = await outsider.client
      .from("company_instagram_connections")
      .insert(connectionRow(companyId, ana, "ig_private_acct_2"));
    expect(insert.error?.code).toBe("42501");
  });

  it("refuses to attach one Instagram account to a second agent in the same company", async () => {
    const owner = await signUpTestUser("owner");
    const companyId = await createCompany(owner.cookieHeader, "Instagram One Agent Co");
    const { malu, ana } = await agentIds(owner);

    const first = await owner.client
      .from("company_instagram_connections")
      .insert(connectionRow(companyId, malu, "ig_shared_acct"));
    expect(first.error).toBeNull();

    // The rule N4 depends on: the webhook identifies the business only by
    // this account id, so two agents claiming it would leave no criterion
    // for deciding who answers.
    const second = await owner.client
      .from("company_instagram_connections")
      .insert(connectionRow(companyId, ana, "ig_shared_acct"));
    expect(second.error?.code).toBe("23505");

    // A different account on the same second agent is entirely fine -- the
    // constraint is per account, not "one Instagram per company".
    const other = await owner.client
      .from("company_instagram_connections")
      .insert(connectionRow(companyId, ana, "ig_other_acct"));
    expect(other.error).toBeNull();
  });

  it("refuses to attach one Instagram account to two different companies", async () => {
    const first = await signUpTestUser("first");
    const second = await signUpTestUser("second");
    const firstCompany = await createCompany(first.cookieHeader, "Instagram Claim Co A");
    const secondCompany = await createCompany(second.cookieHeader, "Instagram Claim Co B");
    const { malu } = await agentIds(first);

    const claimed = await first.client
      .from("company_instagram_connections")
      .insert(connectionRow(firstCompany, malu, "ig_contested_acct"));
    expect(claimed.error).toBeNull();

    // Same ambiguity as the two-agents case, one level up: Meta delivers
    // the webhook for an account once, so the account has to resolve to a
    // single company too -- hence a platform-wide index, not a per-company one.
    const contested = await second.client
      .from("company_instagram_connections")
      .insert(connectionRow(secondCompany, malu, "ig_contested_acct"));
    expect(contested.error?.code).toBe("23505");
  });

  it("frees the account again once the holding connection is disconnected", async () => {
    const owner = await signUpTestUser("owner");
    const companyId = await createCompany(owner.cookieHeader, "Instagram Move Co");
    const { malu, ana } = await agentIds(owner);

    await owner.client.from("company_instagram_connections").insert(connectionRow(companyId, malu, "ig_moving_acct"));

    // This is the "move it to the other employee" flow N2/N3 will drive:
    // release it on one agent, claim it on the next. The index is partial on
    // status precisely so this works without deleting history.
    const released = await owner.client
      .from("company_instagram_connections")
      .update({ status: "disconnected" })
      .eq("company_id", companyId)
      .eq("agent_id", malu);
    expect(released.error).toBeNull();

    const reclaimed = await owner.client
      .from("company_instagram_connections")
      .insert(connectionRow(companyId, ana, "ig_moving_acct"));
    expect(reclaimed.error).toBeNull();

    const connected = await owner.client
      .from("company_instagram_connections")
      .select("agent_id")
      .eq("instagram_user_id", "ig_moving_acct")
      .eq("status", "connected");
    expect(connected.data).toHaveLength(1);
    expect((connected.data as { agent_id: string }[])[0].agent_id).toBe(ana);
  });
});
