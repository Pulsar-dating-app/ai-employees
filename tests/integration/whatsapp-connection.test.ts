import { describe, expect, it } from "vitest";
import { api } from "./helpers/request";
import { signUpTestUser } from "./helpers/auth";

// Trello ticket D1. The Meta Graph API is stood in for by
// tests/integration/helpers/graph-api-mock.ts (wired in via
// META_GRAPH_API_BASE_URL in global-setup.ts) -- mocking Meta itself is
// correct here since it's a genuine third-party HTTP dependency, not our
// own DB/RLS; everything else (auth, RLS, the actual Postgres rows) goes
// through the real local Supabase stack.
describe("WhatsApp connection (GET/DELETE /whatsapp, POST /whatsapp/connect)", () => {
  async function createCompany(ownerCookie: string, name: string) {
    const created = await api<{ company: { id: string } }>("POST", "/api/companies", ownerCookie, { name });
    return created.json.company.id;
  }

  async function addMember(ownerCookie: string, companyId: string, userId: string) {
    await api("POST", `/api/companies/${companyId}/members`, ownerCookie, { userId, role: "member" });
  }

  function connectBody(overrides: Partial<{ code: string; phoneNumberId: string; wabaId: string }> = {}) {
    return {
      code: "good-code",
      phoneNumberId: "1234567890",
      wabaId: "0987654321",
      ...overrides,
    };
  }

  it("requires authentication", async () => {
    const owner = await signUpTestUser("owner");
    const companyId = await createCompany(owner.cookieHeader, "Auth Check WA Co");

    expect((await api("GET", `/api/companies/${companyId}/whatsapp`)).status).toBe(401);
    expect((await api("DELETE", `/api/companies/${companyId}/whatsapp`)).status).toBe(401);
    expect(
      (await api("POST", `/api/companies/${companyId}/whatsapp/connect`, undefined, connectBody())).status,
    ).toBe(401);
  });

  it("blocks non-members", async () => {
    const owner = await signUpTestUser("owner");
    const outsider = await signUpTestUser("outsider");
    const companyId = await createCompany(owner.cookieHeader, "Members Only WA Co");

    expect((await api("GET", `/api/companies/${companyId}/whatsapp`, outsider.cookieHeader)).status).toBe(403);
    expect((await api("DELETE", `/api/companies/${companyId}/whatsapp`, outsider.cookieHeader)).status).toBe(403);
    expect(
      (
        await api(
          "POST",
          `/api/companies/${companyId}/whatsapp/connect`,
          outsider.cookieHeader,
          connectBody(),
        )
      ).status,
    ).toBe(403);
  });

  it("lets a plain member view status but not connect or disconnect", async () => {
    const owner = await signUpTestUser("owner");
    const member = await signUpTestUser("member");
    const companyId = await createCompany(owner.cookieHeader, "Read Only WA Co");
    await addMember(owner.cookieHeader, companyId, member.userId);

    const get = await api("GET", `/api/companies/${companyId}/whatsapp`, member.cookieHeader);
    expect(get.status).toBe(200);

    const connect = await api(
      "POST",
      `/api/companies/${companyId}/whatsapp/connect`,
      member.cookieHeader,
      connectBody(),
    );
    expect(connect.status).toBe(403);

    const disconnect = await api("DELETE", `/api/companies/${companyId}/whatsapp`, member.cookieHeader);
    expect(disconnect.status).toBe(403);
  });

  it("rejects a body missing code/phoneNumberId/wabaId", async () => {
    const owner = await signUpTestUser("owner");
    const companyId = await createCompany(owner.cookieHeader, "Bad Body WA Co");

    const result = await api(
      "POST",
      `/api/companies/${companyId}/whatsapp/connect`,
      owner.cookieHeader,
      { code: "only-code" },
    );
    expect(result.status).toBe(400);
  });

  it("connects, never returns the access token, and is idempotent on reconnect", async () => {
    const owner = await signUpTestUser("owner");
    const companyId = await createCompany(owner.cookieHeader, "Connect WA Co");

    const before = await api<{ connection: unknown }>(
      "GET",
      `/api/companies/${companyId}/whatsapp`,
      owner.cookieHeader,
    );
    expect(before.json.connection).toBeNull();

    const connected = await api<{
      connection: {
        phone_number_id: string;
        waba_id: string;
        display_phone_number: string;
        status: string;
        token_expires_at: string;
        access_token?: string;
      };
    }>("POST", `/api/companies/${companyId}/whatsapp/connect`, owner.cookieHeader, connectBody());

    expect(connected.status).toBe(200);
    expect(connected.json.connection.status).toBe("connected");
    expect(connected.json.connection.phone_number_id).toBe("1234567890");
    expect(connected.json.connection.waba_id).toBe("0987654321");
    expect(connected.json.connection.display_phone_number).toBe("+55 11 91234-5678");
    expect(connected.json.connection.access_token).toBeUndefined();
    expect(new Date(connected.json.connection.token_expires_at).getTime()).toBeGreaterThan(Date.now());

    const reconnected = await api<{ connection: { status: string } }>(
      "POST",
      `/api/companies/${companyId}/whatsapp/connect`,
      owner.cookieHeader,
      connectBody(),
    );
    expect(reconnected.status).toBe(200); // upsert, not a 409/500 on repeat
    expect(reconnected.json.connection.status).toBe("connected");

    const after = await api<{ connection: { status: string } }>(
      "GET",
      `/api/companies/${companyId}/whatsapp`,
      owner.cookieHeader,
    );
    expect(after.json.connection.status).toBe("connected");
  });

  it("returns 502 (not a raw Meta error) when the token exchange fails", async () => {
    const owner = await signUpTestUser("owner");
    const companyId = await createCompany(owner.cookieHeader, "Token Fail WA Co");

    const result = await api(
      "POST",
      `/api/companies/${companyId}/whatsapp/connect`,
      owner.cookieHeader,
      connectBody({ code: "trigger-token-failure" }),
    );
    expect(result.status).toBe(502);
  });

  it("returns 502 when phone number registration fails", async () => {
    const owner = await signUpTestUser("owner");
    const companyId = await createCompany(owner.cookieHeader, "Register Fail WA Co");

    const result = await api(
      "POST",
      `/api/companies/${companyId}/whatsapp/connect`,
      owner.cookieHeader,
      connectBody({ phoneNumberId: "trigger-register-failure" }),
    );
    expect(result.status).toBe(502);
  });

  it("returns 502 when the webhook subscription fails", async () => {
    const owner = await signUpTestUser("owner");
    const companyId = await createCompany(owner.cookieHeader, "Subscribe Fail WA Co");

    const result = await api(
      "POST",
      `/api/companies/${companyId}/whatsapp/connect`,
      owner.cookieHeader,
      connectBody({ wabaId: "trigger-subscribe-failure" }),
    );
    expect(result.status).toBe(502);
  });

  it("disconnects: flips status and is a no-op when nothing was connected", async () => {
    const owner = await signUpTestUser("owner");
    const companyId = await createCompany(owner.cookieHeader, "Disconnect WA Co");

    const noopDisconnect = await api<{ connection: unknown }>(
      "DELETE",
      `/api/companies/${companyId}/whatsapp`,
      owner.cookieHeader,
    );
    expect(noopDisconnect.status).toBe(200);
    expect(noopDisconnect.json.connection).toBeNull();

    await api("POST", `/api/companies/${companyId}/whatsapp/connect`, owner.cookieHeader, connectBody());

    const disconnected = await api<{ connection: { status: string; token_expires_at: string | null } }>(
      "DELETE",
      `/api/companies/${companyId}/whatsapp`,
      owner.cookieHeader,
    );
    expect(disconnected.status).toBe(200);
    expect(disconnected.json.connection.status).toBe("disconnected");
    expect(disconnected.json.connection.token_expires_at).toBeNull();

    const after = await api<{ connection: { status: string } }>(
      "GET",
      `/api/companies/${companyId}/whatsapp`,
      owner.cookieHeader,
    );
    expect(after.json.connection.status).toBe("disconnected");
  });
});
