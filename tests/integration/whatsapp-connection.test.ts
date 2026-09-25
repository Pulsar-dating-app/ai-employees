import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { api } from "./helpers/request";
import { signUpTestUser } from "./helpers/auth";
import { seedActivePlan } from "./helpers/billing";
import { getTestEnv } from "./helpers/env";
import { getTestServiceClient } from "./helpers/service-client";

// Trello ticket D1, amended 2026-09-04 to be per-agent. The Meta Graph API
// is stood in for by tests/integration/helpers/graph-api-mock.ts (wired in
// via META_GRAPH_API_BASE_URL in global-setup.ts) -- mocking Meta itself is
// correct here since it's a genuine third-party HTTP dependency, not our
// own DB/RLS; everything else (auth, RLS, the actual Postgres rows) goes
// through the real local Supabase stack.
describe("WhatsApp connection (GET/DELETE .../whatsapp, POST .../whatsapp/connect)", () => {
  const service = getTestServiceClient();

  async function connectionRow(companyId: string) {
    const { data } = await service
      .from("company_whatsapp_connections")
      .select("provider, status, twilio_sender_sid, twilio_sender_id, twilio_sender_status, two_step_pin")
      .eq("company_id", companyId)
      .single();
    return data as {
      provider: string;
      status: string;
      twilio_sender_sid: string | null;
      twilio_sender_id: string | null;
      twilio_sender_status: string | null;
      two_step_pin: string | null;
    };
  }

  async function createCompany(ownerCookie: string, name: string) {
    const created = await api<{ company: { id: string } }>("POST", "/api/companies", ownerCookie, { name });
    return created.json.company.id;
  }

  async function addMember(ownerCookie: string, companyId: string, userId: string) {
    await api("POST", `/api/companies/${companyId}/members`, ownerCookie, { userId, role: "member" });
  }

  async function hireAgent(ownerCookie: string, companyId: string, agentSlug: string) {
    // P6 (active plan) + the WhatsApp add-on (2026-09-22): connecting a
    // number is gated on `_wpp` plan variants, so every test in this file
    // that exercises a real connect attempt needs one. The permission/
    // validation-only tests below don't care which plan -- they 401/403/400
    // before the route ever reads company_billing.
    await seedActivePlan(companyId, { planKey: "starter_wpp" });
    await api("POST", `/api/companies/${companyId}/agents/${agentSlug}`, ownerCookie);
  }

  function connectPath(companyId: string, agentSlug: string) {
    return `/api/companies/${companyId}/agents/${agentSlug}/whatsapp/connect`;
  }

  function statusPath(companyId: string, agentSlug: string) {
    return `/api/companies/${companyId}/agents/${agentSlug}/whatsapp`;
  }

  // company_whatsapp_connections has a platform-wide unique index on
  // phone_number_id (where status <> 'disconnected', migration
  // 20260905090000), so two tests reusing one number would collide on the
  // second connect. A fresh number per call keeps every test independent --
  // the same reason instagram-connection.test.ts derives a unique account
  // id from a unique code. The mock returns the same display number for any
  // phoneNumberId, so the assertions below stay stable.
  function connectBody(overrides: Partial<{ code: string; phoneNumberId: string; wabaId: string }> = {}) {
    const unique = randomUUID().slice(0, 8);
    return {
      code: "good-code",
      phoneNumberId: `phone-${unique}`,
      wabaId: `waba-${unique}`,
      ...overrides,
    };
  }

  it("requires authentication", async () => {
    const owner = await signUpTestUser("owner");
    const companyId = await createCompany(owner.cookieHeader, "Auth Check WA Co");
    await hireAgent(owner.cookieHeader, companyId, "malu");

    expect((await api("GET", statusPath(companyId, "malu"))).status).toBe(401);
    expect((await api("DELETE", statusPath(companyId, "malu"))).status).toBe(401);
    expect(
      (await api("POST", connectPath(companyId, "malu"), undefined, connectBody())).status,
    ).toBe(401);
  });

  it("blocks non-members", async () => {
    const owner = await signUpTestUser("owner");
    const outsider = await signUpTestUser("outsider");
    const companyId = await createCompany(owner.cookieHeader, "Members Only WA Co");
    await hireAgent(owner.cookieHeader, companyId, "malu");

    expect((await api("GET", statusPath(companyId, "malu"), outsider.cookieHeader)).status).toBe(403);
    expect((await api("DELETE", statusPath(companyId, "malu"), outsider.cookieHeader)).status).toBe(403);
    expect(
      (await api("POST", connectPath(companyId, "malu"), outsider.cookieHeader, connectBody())).status,
    ).toBe(403);
  });

  it("rejects an agent the company never hired", async () => {
    const owner = await signUpTestUser("owner");
    const companyId = await createCompany(owner.cookieHeader, "Not Hired WA Co");

    expect((await api("GET", statusPath(companyId, "malu"), owner.cookieHeader)).status).toBe(400);
    expect(
      (await api("POST", connectPath(companyId, "malu"), owner.cookieHeader, connectBody())).status,
    ).toBe(400);
  });

  it("lets a plain member view status but not connect or disconnect", async () => {
    const owner = await signUpTestUser("owner");
    const member = await signUpTestUser("member");
    const companyId = await createCompany(owner.cookieHeader, "Read Only WA Co");
    await hireAgent(owner.cookieHeader, companyId, "malu");
    await addMember(owner.cookieHeader, companyId, member.userId);

    const get = await api("GET", statusPath(companyId, "malu"), member.cookieHeader);
    expect(get.status).toBe(200);

    const connect = await api("POST", connectPath(companyId, "malu"), member.cookieHeader, connectBody());
    expect(connect.status).toBe(403);

    const disconnect = await api("DELETE", statusPath(companyId, "malu"), member.cookieHeader);
    expect(disconnect.status).toBe(403);
  });

  it("rejects a body missing code/phoneNumberId/wabaId", async () => {
    const owner = await signUpTestUser("owner");
    const companyId = await createCompany(owner.cookieHeader, "Bad Body WA Co");
    await hireAgent(owner.cookieHeader, companyId, "malu");

    const result = await api("POST", connectPath(companyId, "malu"), owner.cookieHeader, {
      code: "only-code",
    });
    expect(result.status).toBe(400);
  });

  // 2026-09-22 -- WhatsApp is a paid add-on (`_wpp` plan variants,
  // plans.ts), not something every subscriber gets. A company on a plain
  // plan (or no plan at all) must be rejected before any Meta call is made.
  it("blocks connecting without the WhatsApp add-on on the plan", async () => {
    const owner = await signUpTestUser("owner");
    const companyId = await createCompany(owner.cookieHeader, "No WPP Addon Co");
    await seedActivePlan(companyId, { planKey: "starter" }); // active, but no WhatsApp add-on
    await api("POST", `/api/companies/${companyId}/agents/malu`, owner.cookieHeader);

    const result = await api<{ error: string }>(
      "POST",
      connectPath(companyId, "malu"),
      owner.cookieHeader,
      connectBody(),
    );
    expect(result.status).toBe(403);
    expect(result.json.error).toBe("whatsapp_addon_required");

    const status = await api<{ connection: unknown }>("GET", statusPath(companyId, "malu"), owner.cookieHeader);
    expect(status.json.connection).toBeNull();
  });

  it("registers a Twilio sender under a new subaccount, never returns secrets, and reuses the sender on reconnect", async () => {
    const owner = await signUpTestUser("owner");
    const companyId = await createCompany(owner.cookieHeader, "Connect WA Co");
    await hireAgent(owner.cookieHeader, companyId, "malu");
    const body = connectBody();

    const before = await api<{ connection: unknown }>("GET", statusPath(companyId, "malu"), owner.cookieHeader);
    expect(before.json.connection).toBeNull();

    const connected = await api<{
      connection: {
        phone_number_id: string;
        waba_id: string;
        display_phone_number: string;
        status: string;
        provider: string;
        twilio_sender_status: string;
        token_expires_at: string;
        access_token?: string;
        twilio_sender_sid?: string;
      };
    }>("POST", connectPath(companyId, "malu"), owner.cookieHeader, body);

    expect(connected.status).toBe(200);
    expect(connected.json.connection.status).toBe("connected");
    expect(connected.json.connection.provider).toBe("twilio");
    expect(connected.json.connection.twilio_sender_status).toBe("ONLINE");
    expect(connected.json.connection.phone_number_id).toBe(body.phoneNumberId);
    expect(connected.json.connection.waba_id).toBe(body.wabaId);
    expect(connected.json.connection.display_phone_number).toBe("+55 11 91234-5678");
    expect(connected.json.connection.access_token).toBeUndefined();
    expect(connected.json.connection.twilio_sender_sid).toBeUndefined();
    expect(new Date(connected.json.connection.token_expires_at).getTime()).toBeGreaterThan(Date.now());

    const row = await connectionRow(companyId);
    expect(row.twilio_sender_id).toBe("whatsapp:+5511912345678");
    expect(row.twilio_sender_sid).toMatch(/^XE/);
    expect(row.two_step_pin).toBeNull();

    const { data: subaccounts } = await service
      .from("company_twilio_accounts")
      .select("account_sid")
      .eq("company_id", companyId);
    expect(subaccounts).toHaveLength(1);

    const reconnected = await api<{ connection: { status: string } }>(
      "POST",
      connectPath(companyId, "malu"),
      owner.cookieHeader,
      body,
    );
    expect(reconnected.status).toBe(200);
    expect(reconnected.json.connection.status).toBe("connected");
    expect((await connectionRow(companyId)).twilio_sender_sid).toBe(row.twilio_sender_sid);
  });

  it("shares one Twilio subaccount across every agent of the same company", async () => {
    const owner = await signUpTestUser("owner");
    const companyId = await createCompany(owner.cookieHeader, "Two Agents WA Co");
    await hireAgent(owner.cookieHeader, companyId, "malu");
    await api("POST", `/api/companies/${companyId}/agents/ana`, owner.cookieHeader);

    expect((await api("POST", connectPath(companyId, "malu"), owner.cookieHeader, connectBody())).status).toBe(200);
    expect((await api("POST", connectPath(companyId, "ana"), owner.cookieHeader, connectBody())).status).toBe(200);

    const { data: subaccounts } = await service
      .from("company_twilio_accounts")
      .select("account_sid")
      .eq("company_id", companyId);
    expect(subaccounts).toHaveLength(1);
  });

  it("keeps the connection pending until the Twilio sender is ONLINE, then GET promotes it", async () => {
    const owner = await signUpTestUser("owner");
    const companyId = await createCompany(owner.cookieHeader, "Pending Sender WA Co");
    await hireAgent(owner.cookieHeader, companyId, "malu");

    const connected = await api<{ connection: { status: string; twilio_sender_status: string; connected_at: string | null } }>(
      "POST",
      connectPath(companyId, "malu"),
      owner.cookieHeader,
      connectBody({ wabaId: `trigger-sender-creating-${randomUUID().slice(0, 8)}` }),
    );
    expect(connected.status).toBe(200);
    expect(connected.json.connection.status).toBe("pending");
    expect(connected.json.connection.twilio_sender_status).toBe("CREATING");
    expect(connected.json.connection.connected_at).toBeNull();

    const refreshed = await api<{ connection: { status: string; twilio_sender_status: string; connected_at: string | null } }>(
      "GET",
      statusPath(companyId, "malu"),
      owner.cookieHeader,
    );
    expect(refreshed.json.connection.status).toBe("connected");
    expect(refreshed.json.connection.twilio_sender_status).toBe("ONLINE");
    expect(refreshed.json.connection.connected_at).not.toBeNull();
  });

  it("walks a sender through SMS verification: bad input 400s, rejected code 502s, a good code promotes it", async () => {
    const owner = await signUpTestUser("owner");
    const member = await signUpTestUser("member");
    const companyId = await createCompany(owner.cookieHeader, "Verify Sender WA Co");
    await hireAgent(owner.cookieHeader, companyId, "malu");
    await addMember(owner.cookieHeader, companyId, member.userId);

    const connected = await api<{ connection: { status: string; twilio_sender_status: string } }>(
      "POST",
      connectPath(companyId, "malu"),
      owner.cookieHeader,
      connectBody({ wabaId: `trigger-sender-verification-${randomUUID().slice(0, 8)}` }),
    );
    expect(connected.json.connection).toMatchObject({ status: "pending", twilio_sender_status: "PENDING_VERIFICATION" });

    const stillWaiting = await api<{ connection: { status: string; twilio_sender_status: string } }>(
      "GET",
      statusPath(companyId, "malu"),
      owner.cookieHeader,
    );
    expect(stillWaiting.json.connection).toMatchObject({ status: "pending", twilio_sender_status: "PENDING_VERIFICATION" });

    expect(
      (await api("PATCH", statusPath(companyId, "malu"), member.cookieHeader, { verificationCode: "123456" })).status,
    ).toBe(403);
    expect(
      (await api("PATCH", statusPath(companyId, "malu"), owner.cookieHeader, { verificationCode: "12" })).status,
    ).toBe(400);
    expect(
      (await api("PATCH", statusPath(companyId, "malu"), owner.cookieHeader, { verificationCode: "000000" })).status,
    ).toBe(502);

    const verified = await api<{ connection: { status: string; twilio_sender_status: string } }>(
      "PATCH",
      statusPath(companyId, "malu"),
      owner.cookieHeader,
      { verificationCode: "123456" },
    );
    expect(verified.status).toBe(200);
    expect(verified.json.connection).toMatchObject({ status: "pending", twilio_sender_status: "VERIFYING" });

    const online = await api<{ connection: { status: string; twilio_sender_status: string } }>(
      "GET",
      statusPath(companyId, "malu"),
      owner.cookieHeader,
    );
    expect(online.json.connection).toMatchObject({ status: "connected", twilio_sender_status: "ONLINE" });

    expect(
      (await api("PATCH", statusPath(companyId, "malu"), owner.cookieHeader, { verificationCode: "123456" })).status,
    ).toBe(409);
  });

  it("surfaces a sender that goes OFFLINE while pending, and lets the admin disconnect it", async () => {
    const owner = await signUpTestUser("owner");
    const companyId = await createCompany(owner.cookieHeader, "Offline Sender WA Co");
    await hireAgent(owner.cookieHeader, companyId, "malu");

    await api("POST", connectPath(companyId, "malu"), owner.cookieHeader, connectBody({
      wabaId: `trigger-sender-offline-${randomUUID().slice(0, 8)}`,
    }));

    const refreshed = await api<{ connection: { status: string; twilio_sender_status: string } }>(
      "GET",
      statusPath(companyId, "malu"),
      owner.cookieHeader,
    );
    expect(refreshed.json.connection).toMatchObject({ status: "pending", twilio_sender_status: "OFFLINE" });

    const disconnected = await api<{ connection: { status: string } }>("DELETE", statusPath(companyId, "malu"), owner.cookieHeader);
    expect(disconnected.json.connection.status).toBe("disconnected");
  });

  it("returns 502 (not a raw Meta error) when the token exchange fails", async () => {
    const owner = await signUpTestUser("owner");
    const companyId = await createCompany(owner.cookieHeader, "Token Fail WA Co");
    await hireAgent(owner.cookieHeader, companyId, "malu");

    const result = await api(
      "POST",
      connectPath(companyId, "malu"),
      owner.cookieHeader,
      connectBody({ code: "trigger-token-failure" }),
    );
    expect(result.status).toBe(502);
  });

  it("returns 502 and writes nothing when Twilio rejects the sender", async () => {
    const owner = await signUpTestUser("owner");
    const companyId = await createCompany(owner.cookieHeader, "Sender Fail WA Co");
    await hireAgent(owner.cookieHeader, companyId, "malu");

    const result = await api(
      "POST",
      connectPath(companyId, "malu"),
      owner.cookieHeader,
      connectBody({ wabaId: "trigger-sender-failure" }),
    );
    expect(result.status).toBe(502);

    const status = await api<{ connection: unknown }>("GET", statusPath(companyId, "malu"), owner.cookieHeader);
    expect(status.json.connection).toBeNull();
  });

  it("returns 502 when the Twilio subaccount can't be created", async () => {
    const owner = await signUpTestUser("owner");
    const companyId = await createCompany(owner.cookieHeader, "trigger-subaccount-failure Co");
    await hireAgent(owner.cookieHeader, companyId, "malu");

    const result = await api("POST", connectPath(companyId, "malu"), owner.cookieHeader, connectBody());
    expect(result.status).toBe(502);

    const { data: subaccounts } = await service.from("company_twilio_accounts").select("account_sid").eq("company_id", companyId);
    expect(subaccounts).toEqual([]);
  });

  it("never exposes the Twilio subaccount table to a regular client", async () => {
    const owner = await signUpTestUser("owner");
    const companyId = await createCompany(owner.cookieHeader, "Subaccount RLS WA Co");
    await hireAgent(owner.cookieHeader, companyId, "malu");
    await api("POST", connectPath(companyId, "malu"), owner.cookieHeader, connectBody());

    const read = await owner.client.from("company_twilio_accounts").select("account_sid, auth_token");
    expect(read.error).not.toBeNull();

    const write = await owner.client
      .from("company_twilio_accounts")
      .update({ auth_token: "hijacked" })
      .eq("company_id", companyId)
      .select("company_id");
    expect(write.error).not.toBeNull();
  });

  it("disconnects: deletes the Twilio sender, flips status, and is a no-op when nothing was connected", async () => {
    const owner = await signUpTestUser("owner");
    const companyId = await createCompany(owner.cookieHeader, "Disconnect WA Co");
    await hireAgent(owner.cookieHeader, companyId, "malu");

    const noopDisconnect = await api<{ connection: unknown }>(
      "DELETE",
      statusPath(companyId, "malu"),
      owner.cookieHeader,
    );
    expect(noopDisconnect.status).toBe(200);
    expect(noopDisconnect.json.connection).toBeNull();

    await api("POST", connectPath(companyId, "malu"), owner.cookieHeader, connectBody());
    const senderSid = (await connectionRow(companyId)).twilio_sender_sid;

    const disconnected = await api<{ connection: { status: string; token_expires_at: string | null } }>(
      "DELETE",
      statusPath(companyId, "malu"),
      owner.cookieHeader,
    );
    expect(disconnected.status).toBe(200);
    expect(disconnected.json.connection.status).toBe("disconnected");
    expect(disconnected.json.connection.token_expires_at).toBeNull();
    expect((await connectionRow(companyId)).twilio_sender_sid).toBeNull();

    const deleted = (await (await fetch(`${getTestEnv().twilioApiMockUrl}/__deleted_senders`)).json()) as string[];
    expect(deleted).toContain(senderSid);

    const after = await api<{ connection: { status: string } }>(
      "GET",
      statusPath(companyId, "malu"),
      owner.cookieHeader,
    );
    expect(after.json.connection.status).toBe("disconnected");
  });
});
