import { describe, expect, it } from "vitest";
import { api } from "./helpers/request";
import { signUpTestUser } from "./helpers/auth";

// Trello N2. Instagram's endpoints are stood in for by
// tests/integration/helpers/instagram-api-mock.ts (wired in via
// INSTAGRAM_API_BASE_URL/INSTAGRAM_GRAPH_BASE_URL in global-setup.ts) --
// mocking Meta itself is correct here since it's a genuine third-party HTTP
// dependency, not our own DB/RLS; everything else (auth, RLS, the actual
// Postgres rows, the account-uniqueness index from N1) goes through the
// real local Supabase stack.
describe("Instagram connection (GET/DELETE .../instagram, POST .../instagram/connect)", () => {
  async function createCompany(ownerCookie: string, name: string) {
    const created = await api<{ company: { id: string } }>("POST", "/api/companies", ownerCookie, { name });
    return created.json.company.id;
  }

  async function addMember(ownerCookie: string, companyId: string, userId: string) {
    await api("POST", `/api/companies/${companyId}/members`, ownerCookie, { userId, role: "member" });
  }

  async function hireAgent(ownerCookie: string, companyId: string, agentSlug: string) {
    await api("POST", `/api/companies/${companyId}/agents/${agentSlug}`, ownerCookie);
  }

  function connectPath(companyId: string, agentSlug: string) {
    return `/api/companies/${companyId}/agents/${agentSlug}/instagram/connect`;
  }

  function statusPath(companyId: string, agentSlug: string) {
    return `/api/companies/${companyId}/agents/${agentSlug}/instagram`;
  }

  // The mock derives the stored account id from the code (igsid_{code} --
  // the value GET /me?fields=user_id returns, not the OAuth exchange's
  // app-scoped igid_{code}), so a unique code per test doubles as a unique,
  // predictable account id -- this is how tests get a specific account
  // "held" without threading extra state through the mock.
  function connectBody(code: string, overrides: Partial<{ force: boolean }> = {}) {
    return { code, ...overrides };
  }

  it("requires authentication", async () => {
    const owner = await signUpTestUser("owner");
    const companyId = await createCompany(owner.cookieHeader, "Auth Check IG Co");
    await hireAgent(owner.cookieHeader, companyId, "malu");

    expect((await api("GET", statusPath(companyId, "malu"))).status).toBe(401);
    expect((await api("DELETE", statusPath(companyId, "malu"))).status).toBe(401);
    expect(
      (await api("POST", connectPath(companyId, "malu"), undefined, connectBody("auth-check"))).status,
    ).toBe(401);
  });

  it("blocks non-members", async () => {
    const owner = await signUpTestUser("owner");
    const outsider = await signUpTestUser("outsider");
    const companyId = await createCompany(owner.cookieHeader, "Members Only IG Co");
    await hireAgent(owner.cookieHeader, companyId, "malu");

    expect((await api("GET", statusPath(companyId, "malu"), outsider.cookieHeader)).status).toBe(403);
    expect((await api("DELETE", statusPath(companyId, "malu"), outsider.cookieHeader)).status).toBe(403);
    expect(
      (
        await api("POST", connectPath(companyId, "malu"), outsider.cookieHeader, connectBody("members-only"))
      ).status,
    ).toBe(403);
  });

  it("lets a plain member view status but not connect or disconnect", async () => {
    const owner = await signUpTestUser("owner");
    const member = await signUpTestUser("member");
    const companyId = await createCompany(owner.cookieHeader, "Read Only IG Co");
    await hireAgent(owner.cookieHeader, companyId, "malu");
    await addMember(owner.cookieHeader, companyId, member.userId);

    expect((await api("GET", statusPath(companyId, "malu"), member.cookieHeader)).status).toBe(200);
    expect(
      (await api("POST", connectPath(companyId, "malu"), member.cookieHeader, connectBody("read-only"))).status,
    ).toBe(403);
    expect((await api("DELETE", statusPath(companyId, "malu"), member.cookieHeader)).status).toBe(403);
  });

  it("404s for a slug that isn't a real agent, 400s for one this company hasn't hired", async () => {
    const owner = await signUpTestUser("owner");
    const companyId = await createCompany(owner.cookieHeader, "Unhired IG Co");

    expect((await api("GET", statusPath(companyId, "not-a-real-agent"), owner.cookieHeader)).status).toBe(404);
    // ana exists but this company never hired her.
    expect((await api("GET", statusPath(companyId, "ana"), owner.cookieHeader)).status).toBe(400);
  });

  it("rejects a body missing code", async () => {
    const owner = await signUpTestUser("owner");
    const companyId = await createCompany(owner.cookieHeader, "Bad Body IG Co");
    await hireAgent(owner.cookieHeader, companyId, "malu");

    const result = await api("POST", connectPath(companyId, "malu"), owner.cookieHeader, {});
    expect(result.status).toBe(400);
  });

  it("connects, never returns the access token, and is idempotent on reconnect", async () => {
    const owner = await signUpTestUser("owner");
    const companyId = await createCompany(owner.cookieHeader, "Connect IG Co");
    await hireAgent(owner.cookieHeader, companyId, "malu");

    const before = await api<{ connection: unknown }>("GET", statusPath(companyId, "malu"), owner.cookieHeader);
    expect(before.json.connection).toBeNull();

    const connected = await api<{
      connection: {
        instagram_user_id: string;
        username: string;
        status: string;
        token_expires_at: string;
        access_token?: string;
      };
    }>("POST", connectPath(companyId, "malu"), owner.cookieHeader, connectBody("connect-flow"));

    expect(connected.status).toBe(200);
    expect(connected.json.connection.status).toBe("connected");
    // The professional-account id from GET /me?fields=user_id -- NOT the
    // OAuth exchange's app-scoped "igid_connect-flow".
    expect(connected.json.connection.instagram_user_id).toBe("igsid_connect-flow");
    expect(connected.json.connection.username).toBe("user_igsid_connect-flow");
    expect(connected.json.connection.access_token).toBeUndefined();
    expect(new Date(connected.json.connection.token_expires_at).getTime()).toBeGreaterThan(Date.now());

    // Reconnecting with the SAME code -> same account -> same (company,
    // agent) row via the upsert. Not a 409: a caller reconnecting their own
    // still-held account is not a conflict.
    const reconnected = await api<{ connection: { status: string } }>(
      "POST",
      connectPath(companyId, "malu"),
      owner.cookieHeader,
      connectBody("connect-flow"),
    );
    expect(reconnected.status).toBe(200);
    expect(reconnected.json.connection.status).toBe("connected");

    const after = await api<{ connection: { status: string } }>("GET", statusPath(companyId, "malu"), owner.cookieHeader);
    expect(after.json.connection.status).toBe("connected");
  });

  it("returns 502 (not a raw Meta error) when any step of the Meta round trip fails", async () => {
    const owner = await signUpTestUser("owner");
    const companyId = await createCompany(owner.cookieHeader, "Meta Fail IG Co");
    await hireAgent(owner.cookieHeader, companyId, "malu");

    for (const code of ["trigger-token-failure", "trigger-exchange-failure", "trigger-subscribe-failure"]) {
      const result = await api("POST", connectPath(companyId, "malu"), owner.cookieHeader, connectBody(code));
      expect(result.status).toBe(502);
    }
  });

  it("refuses to connect an account another agent in the SAME company already holds, then moves it with force", async () => {
    const owner = await signUpTestUser("owner");
    const companyId = await createCompany(owner.cookieHeader, "Move Between Agents IG Co");
    await hireAgent(owner.cookieHeader, companyId, "malu");
    await hireAgent(owner.cookieHeader, companyId, "ana");

    const onMalu = await api<{ connection: { instagram_user_id: string } }>(
      "POST",
      connectPath(companyId, "malu"),
      owner.cookieHeader,
      connectBody("shared-account"),
    );
    expect(onMalu.status).toBe(200);

    // Same code -> same account id -> conflict against ana, not a 500.
    const blocked = await api<{ error: string; agentSlug: string }>(
      "POST",
      connectPath(companyId, "ana"),
      owner.cookieHeader,
      connectBody("shared-account"),
    );
    expect(blocked.status).toBe(409);
    expect(blocked.json.error).toBe("instagram_account_connected_to_other_agent");
    expect(blocked.json.agentSlug).toBe("malu");

    // With force: true, the merchant's own account moves from malu to ana
    // in one call -- malu's connection is released, ana's is created.
    const moved = await api<{ connection: { instagram_user_id: string; status: string } }>(
      "POST",
      connectPath(companyId, "ana"),
      owner.cookieHeader,
      connectBody("shared-account", { force: true }),
    );
    expect(moved.status).toBe(200);
    expect(moved.json.connection.status).toBe("connected");
    expect(moved.json.connection.instagram_user_id).toBe("igsid_shared-account");

    const maluAfter = await api<{ connection: { status: string } | null }>(
      "GET",
      statusPath(companyId, "malu"),
      owner.cookieHeader,
    );
    expect(maluAfter.json.connection?.status).toBe("disconnected");

    const anaAfter = await api<{ connection: { status: string } | null }>(
      "GET",
      statusPath(companyId, "ana"),
      owner.cookieHeader,
    );
    expect(anaAfter.json.connection?.status).toBe("connected");
  });

  it("refuses to connect an account a DIFFERENT company holds, even with force", async () => {
    const first = await signUpTestUser("first");
    const second = await signUpTestUser("second");
    const firstCompany = await createCompany(first.cookieHeader, "Contested IG Co A");
    const secondCompany = await createCompany(second.cookieHeader, "Contested IG Co B");
    await hireAgent(first.cookieHeader, firstCompany, "malu");
    await hireAgent(second.cookieHeader, secondCompany, "malu");

    const claimed = await api(
      "POST",
      connectPath(firstCompany, "malu"),
      first.cookieHeader,
      connectBody("cross-company-account"),
    );
    expect(claimed.status).toBe(200);

    for (const force of [false, true]) {
      const contested = await api<{ error: string }>(
        "POST",
        connectPath(secondCompany, "malu"),
        second.cookieHeader,
        connectBody("cross-company-account", { force }),
      );
      expect(contested.status).toBe(409);
      expect(contested.json.error).toBe("instagram_account_connected_elsewhere");
    }
  });

  it("disconnects: flips status, is a no-op when nothing was connected, and frees the account", async () => {
    const owner = await signUpTestUser("owner");
    const companyId = await createCompany(owner.cookieHeader, "Disconnect IG Co");
    await hireAgent(owner.cookieHeader, companyId, "malu");
    await hireAgent(owner.cookieHeader, companyId, "ana");

    const noopDisconnect = await api<{ connection: unknown }>("DELETE", statusPath(companyId, "malu"), owner.cookieHeader);
    expect(noopDisconnect.status).toBe(200);
    expect(noopDisconnect.json.connection).toBeNull();

    await api("POST", connectPath(companyId, "malu"), owner.cookieHeader, connectBody("disconnect-flow"));

    const disconnected = await api<{ connection: { status: string; token_expires_at: string | null } }>(
      "DELETE",
      statusPath(companyId, "malu"),
      owner.cookieHeader,
    );
    expect(disconnected.status).toBe(200);
    expect(disconnected.json.connection.status).toBe("disconnected");
    expect(disconnected.json.connection.token_expires_at).toBeNull();

    // The account is free again -- a sibling agent can claim it with no
    // conflict and no force flag needed.
    const reclaimed = await api<{ connection: { status: string } }>(
      "POST",
      connectPath(companyId, "ana"),
      owner.cookieHeader,
      connectBody("disconnect-flow"),
    );
    expect(reclaimed.status).toBe(200);
    expect(reclaimed.json.connection.status).toBe("connected");
  });
});
