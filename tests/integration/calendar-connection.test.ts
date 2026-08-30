import { describe, expect, it } from "vitest";
import { api } from "./helpers/request";
import { signUpTestUser } from "./helpers/auth";
import { getTestServiceClient } from "./helpers/service-client";

// Trello ticket I1. Google's real oauth2.googleapis.com/token is stood in
// for by tests/integration/helpers/google-oauth-mock.ts (wired in via
// GOOGLE_OAUTH_TOKEN_URL in global-setup.ts) -- mocking Google itself is
// correct here since it's a genuine third-party HTTP dependency, not our own
// DB/RLS; everything else (auth, RLS, the actual Postgres rows) goes through
// the real local Supabase stack. Structurally a copy of
// whatsapp-connection.test.ts.
describe("Google Calendar connection (GET/DELETE /calendar, POST /calendar/connect)", () => {
  async function createCompany(ownerCookie: string, name: string) {
    const created = await api<{ company: { id: string } }>("POST", "/api/companies", ownerCookie, { name });
    return created.json.company.id;
  }

  async function addMember(ownerCookie: string, companyId: string, userId: string) {
    await api("POST", `/api/companies/${companyId}/members`, ownerCookie, { userId, role: "member" });
  }

  it("requires authentication", async () => {
    const owner = await signUpTestUser("owner");
    const companyId = await createCompany(owner.cookieHeader, "Auth Check Cal Co");

    expect((await api("GET", `/api/companies/${companyId}/calendar`)).status).toBe(401);
    expect((await api("DELETE", `/api/companies/${companyId}/calendar`)).status).toBe(401);
    expect(
      (await api("POST", `/api/companies/${companyId}/calendar/connect`, undefined, { code: "good-code" })).status,
    ).toBe(401);
  });

  it("blocks non-members", async () => {
    const owner = await signUpTestUser("owner");
    const outsider = await signUpTestUser("outsider");
    const companyId = await createCompany(owner.cookieHeader, "Members Only Cal Co");

    expect((await api("GET", `/api/companies/${companyId}/calendar`, outsider.cookieHeader)).status).toBe(403);
    expect((await api("DELETE", `/api/companies/${companyId}/calendar`, outsider.cookieHeader)).status).toBe(403);
    expect(
      (
        await api(
          "POST",
          `/api/companies/${companyId}/calendar/connect`,
          outsider.cookieHeader,
          { code: "good-code" },
        )
      ).status,
    ).toBe(403);
  });

  it("lets a plain member view status but not connect or disconnect", async () => {
    const owner = await signUpTestUser("owner");
    const member = await signUpTestUser("member");
    const companyId = await createCompany(owner.cookieHeader, "Read Only Cal Co");
    await addMember(owner.cookieHeader, companyId, member.userId);

    const get = await api("GET", `/api/companies/${companyId}/calendar`, member.cookieHeader);
    expect(get.status).toBe(200);

    const connect = await api(
      "POST",
      `/api/companies/${companyId}/calendar/connect`,
      member.cookieHeader,
      { code: "good-code" },
    );
    expect(connect.status).toBe(403);

    const disconnect = await api("DELETE", `/api/companies/${companyId}/calendar`, member.cookieHeader);
    expect(disconnect.status).toBe(403);
  });

  it("rejects a body missing code", async () => {
    const owner = await signUpTestUser("owner");
    const companyId = await createCompany(owner.cookieHeader, "Bad Body Cal Co");

    const result = await api("POST", `/api/companies/${companyId}/calendar/connect`, owner.cookieHeader, {});
    expect(result.status).toBe(400);
  });

  it("connects, never returns either token, and is idempotent on reconnect", async () => {
    const owner = await signUpTestUser("owner");
    const companyId = await createCompany(owner.cookieHeader, "Connect Cal Co");

    const before = await api<{ connection: unknown }>(
      "GET",
      `/api/companies/${companyId}/calendar`,
      owner.cookieHeader,
    );
    expect(before.json.connection).toBeNull();

    const connected = await api<{
      connection: {
        provider: string;
        google_calendar_id: string;
        status: string;
        scopes: string;
        token_expires_at: string;
        access_token?: string;
        refresh_token?: string;
      };
    }>("POST", `/api/companies/${companyId}/calendar/connect`, owner.cookieHeader, { code: "good-code" });

    expect(connected.status).toBe(200);
    expect(connected.json.connection.status).toBe("connected");
    expect(connected.json.connection.provider).toBe("google");
    expect(connected.json.connection.google_calendar_id).toBe("primary");
    expect(connected.json.connection.scopes).toBe("https://www.googleapis.com/auth/calendar");
    expect(connected.json.connection.access_token).toBeUndefined();
    expect(connected.json.connection.refresh_token).toBeUndefined();
    expect(new Date(connected.json.connection.token_expires_at).getTime()).toBeGreaterThan(Date.now());

    const reconnected = await api<{ connection: { status: string } }>(
      "POST",
      `/api/companies/${companyId}/calendar/connect`,
      owner.cookieHeader,
      { code: "good-code" },
    );
    expect(reconnected.status).toBe(200); // upsert, not a 409/500 on repeat
    expect(reconnected.json.connection.status).toBe("connected");

    const after = await api<{ connection: { status: string } }>(
      "GET",
      `/api/companies/${companyId}/calendar`,
      owner.cookieHeader,
    );
    expect(after.json.connection.status).toBe("connected");
  });

  it("retains the previously stored refresh_token when a reconnect's response omits one", async () => {
    const owner = await signUpTestUser("owner");
    const companyId = await createCompany(owner.cookieHeader, "Refresh Retain Cal Co");

    // First connect: the mock includes a fresh refresh_token.
    const first = await api(
      "POST",
      `/api/companies/${companyId}/calendar/connect`,
      owner.cookieHeader,
      { code: "good-code" },
    );
    expect(first.status).toBe(200);

    // Reconnect with a code whose mock response omits refresh_token
    // entirely -- simulates a real reconnect that didn't force
    // prompt=consent. Must still succeed (not lose the connection).
    const second = await api<{ connection: { status: string } }>(
      "POST",
      `/api/companies/${companyId}/calendar/connect`,
      owner.cookieHeader,
      { code: "good-code-no-refresh" },
    );
    expect(second.status).toBe(200);
    expect(second.json.connection.status).toBe("connected");

    // The API never returns either token, so verify retention directly
    // against Postgres: the previously stored refresh_token from the first
    // connect must still be there, not nulled out by the second.
    const row = await getTestServiceClient()
      .from("company_calendar_connections")
      .select("refresh_token")
      .eq("company_id", companyId)
      .single();
    expect(row.data?.refresh_token).toBe("mock-google-refresh-token");
  });

  it("returns 502 (not a raw Google error) when the token exchange fails", async () => {
    const owner = await signUpTestUser("owner");
    const companyId = await createCompany(owner.cookieHeader, "Token Fail Cal Co");

    const result = await api(
      "POST",
      `/api/companies/${companyId}/calendar/connect`,
      owner.cookieHeader,
      { code: "trigger-token-failure" },
    );
    expect(result.status).toBe(502);
  });

  it("disconnects: flips status and is a no-op when nothing was connected", async () => {
    const owner = await signUpTestUser("owner");
    const companyId = await createCompany(owner.cookieHeader, "Disconnect Cal Co");

    const noopDisconnect = await api<{ connection: unknown }>(
      "DELETE",
      `/api/companies/${companyId}/calendar`,
      owner.cookieHeader,
    );
    expect(noopDisconnect.status).toBe(200);
    expect(noopDisconnect.json.connection).toBeNull();

    await api("POST", `/api/companies/${companyId}/calendar/connect`, owner.cookieHeader, { code: "good-code" });

    const disconnected = await api<{ connection: { status: string; token_expires_at: string | null } }>(
      "DELETE",
      `/api/companies/${companyId}/calendar`,
      owner.cookieHeader,
    );
    expect(disconnected.status).toBe(200);
    expect(disconnected.json.connection.status).toBe("disconnected");
    expect(disconnected.json.connection.token_expires_at).toBeNull();

    const after = await api<{ connection: { status: string } }>(
      "GET",
      `/api/companies/${companyId}/calendar`,
      owner.cookieHeader,
    );
    expect(after.json.connection.status).toBe("disconnected");
  });
});
