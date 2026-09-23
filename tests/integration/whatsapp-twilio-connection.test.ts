import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { api } from "./helpers/request";
import { getTestEnv } from "./helpers/env";
import { signUpTestUser } from "./helpers/auth";
import { seedActivePlan } from "./helpers/billing";
import { getTestServiceClient } from "./helpers/service-client";
import type { TwilioMockRequest } from "./helpers/twilio-api-mock";

// WhatsApp via Twilio (2026-09-23): connect / status / disconnect / sender
// sync. Twilio is stood in for by helpers/twilio-api-mock.ts (a genuine
// third-party HTTP dependency, so mocking it is right); auth, RLS and the
// Postgres rows all go through the real local Supabase stack.
describe("WhatsApp connection via Twilio", () => {
  const { baseUrl, twilioApiMockUrl } = getTestEnv();
  const service = getTestServiceClient();

  async function createCompany(ownerCookie: string, name: string) {
    const created = await api<{ company: { id: string } }>("POST", "/api/companies", ownerCookie, { name });
    return created.json.company.id;
  }

  async function hire(ownerCookie: string, companyId: string, agentSlug: string, planKey = "starter_wpp") {
    await seedActivePlan(companyId, { planKey });
    await api("POST", `/api/companies/${companyId}/agents/${agentSlug}`, ownerCookie);
  }

  const connectPath = (companyId: string, slug: string) => `/api/companies/${companyId}/agents/${slug}/whatsapp/twilio/connect`;
  const statusPath = (companyId: string, slug: string) => `/api/companies/${companyId}/agents/${slug}/whatsapp`;

  // A unique number per test -- twilio rows have a platform-wide unique index
  // on phone_e164 while not disconnected.
  function uniquePhone() {
    return `+55119${String(Math.floor(Math.random() * 1e8)).padStart(8, "0")}`;
  }
  function connectBody(overrides: Record<string, unknown> = {}) {
    return { wabaId: `waba-${randomUUID().slice(0, 8)}`, phoneNumber: uniquePhone(), displayName: "Loja Teste", ...overrides };
  }

  async function mockRequests(): Promise<TwilioMockRequest[]> {
    return (await fetch(`${twilioApiMockUrl}/__requests`)).json();
  }

  type Connection = {
    provider: string;
    phone_e164: string;
    status: string;
    sender_status: string | null;
    quality_rating: string | null;
    messaging_limit: string | null;
  };

  describe("POST .../whatsapp/twilio/connect", () => {
    it("requires authentication and an owner/admin", async () => {
      const owner = await signUpTestUser("owner");
      const companyId = await createCompany(owner.cookieHeader, "Twilio Auth Co");
      await hire(owner.cookieHeader, companyId, "malu");

      expect((await api("POST", connectPath(companyId, "malu"), undefined, connectBody())).status).toBe(401);

      const member = await signUpTestUser("member");
      await api("POST", `/api/companies/${companyId}/members`, owner.cookieHeader, { userId: member.userId, role: "member" });
      expect((await api("POST", connectPath(companyId, "malu"), member.cookieHeader, connectBody())).status).toBe(403);
    });

    it("validates the body: WABA, display name and an E.164 number are required", async () => {
      const owner = await signUpTestUser("owner");
      const companyId = await createCompany(owner.cookieHeader, "Twilio Validation Co");
      await hire(owner.cookieHeader, companyId, "malu");

      const path = connectPath(companyId, "malu");
      expect((await api("POST", path, owner.cookieHeader, { ...connectBody(), wabaId: "" })).status).toBe(400);
      expect((await api("POST", path, owner.cookieHeader, { ...connectBody(), displayName: "" })).status).toBe(400);
      const badPhone = await api<{ error: string }>("POST", path, owner.cookieHeader, { ...connectBody(), phoneNumber: "11999998888" });
      expect(badPhone.status).toBe(400);
      expect(badPhone.json.error).toBe("invalid_phone_number");
    });

    it("rejects a company whose plan doesn't include the WhatsApp add-on, before calling Twilio", async () => {
      const owner = await signUpTestUser("owner");
      const companyId = await createCompany(owner.cookieHeader, "Twilio No Addon Co");
      await hire(owner.cookieHeader, companyId, "malu", "starter");

      const res = await api<{ error: string }>("POST", connectPath(companyId, "malu"), owner.cookieHeader, connectBody());
      expect(res.status).toBe(403);
      expect(res.json.error).toBe("whatsapp_addon_required");
      const { data: account } = await service.from("company_twilio_accounts").select("company_id").eq("company_id", companyId);
      expect(account).toHaveLength(0);
    });

    it("creates the company's subaccount and registers the sender, leaving the connection pending", async () => {
      const owner = await signUpTestUser("owner");
      const companyId = await createCompany(owner.cookieHeader, "Twilio Connect Co");
      await hire(owner.cookieHeader, companyId, "malu");
      const body = connectBody();

      const res = await api<{ connection: Connection }>("POST", connectPath(companyId, "malu"), owner.cookieHeader, body);
      expect(res.status).toBe(200);
      expect(res.json.connection).toMatchObject({
        provider: "twilio",
        phone_e164: body.phoneNumber,
        status: "pending",
        sender_status: "CREATING",
      });

      // The subaccount exists, and its token is stored encrypted -- never the
      // mock's plaintext token.
      const { data: account } = await service
        .from("company_twilio_accounts")
        .select("subaccount_sid, auth_token_encrypted, waba_id")
        .eq("company_id", companyId)
        .single();
      expect(account!.subaccount_sid).toMatch(/^ACmocksub/);
      expect(account!.auth_token_encrypted).toMatch(/^v1:/);
      expect(account!.auth_token_encrypted).not.toContain("mock-sub-token");
      expect(account!.waba_id).toBe(body.wabaId);

      // What was actually sent to Twilio: the sender is registered as the
      // *subaccount*, pointed at this company's webhook, on the merchant's WABA.
      const senderRequest = (await mockRequests()).find(
        (r) => r.path === "/v2/Channels/Senders" && (r.body as { sender_id?: string }).sender_id === `whatsapp:${body.phoneNumber}`,
      );
      expect(senderRequest).toBeDefined();
      expect(Buffer.from(senderRequest!.authorization!.replace("Basic ", ""), "base64").toString().split(":")[0]).toBe(
        account!.subaccount_sid,
      );
      expect(senderRequest!.body).toMatchObject({
        configuration: { waba_id: body.wabaId },
        webhook: {
          callback_url: `${baseUrl}/api/webhooks/twilio/whatsapp/${companyId}`,
          status_callback_url: `${baseUrl}/api/webhooks/twilio/whatsapp/${companyId}/status`,
        },
        profile: { name: "Loja Teste" },
      });
    });

    it("is connected straight away when Twilio reports the sender ONLINE", async () => {
      const owner = await signUpTestUser("owner");
      const companyId = await createCompany(owner.cookieHeader, "Twilio Online Co");
      await hire(owner.cookieHeader, companyId, "malu");

      const res = await api<{ connection: Connection }>(
        "POST",
        connectPath(companyId, "malu"),
        owner.cookieHeader,
        connectBody({ displayName: "trigger-online" }),
      );
      expect(res.status).toBe(200);
      expect(res.json.connection.status).toBe("connected");
      expect(res.json.connection.sender_status).toBe("ONLINE");
    });

    it("reuses the company's subaccount for a second agent, but refuses a different WABA", async () => {
      const owner = await signUpTestUser("owner");
      const companyId = await createCompany(owner.cookieHeader, "Twilio Two Agents Co");
      await hire(owner.cookieHeader, companyId, "malu");
      await api("POST", `/api/companies/${companyId}/agents/ana`, owner.cookieHeader);

      const waba = `waba-${randomUUID().slice(0, 8)}`;
      expect((await api("POST", connectPath(companyId, "malu"), owner.cookieHeader, connectBody({ wabaId: waba }))).status).toBe(200);
      expect((await api("POST", connectPath(companyId, "ana"), owner.cookieHeader, connectBody({ wabaId: waba }))).status).toBe(200);

      const { data: accounts } = await service.from("company_twilio_accounts").select("subaccount_sid").eq("company_id", companyId);
      expect(accounts).toHaveLength(1);
      const created = (await mockRequests()).filter(
        (r) => r.path === "/2010-04-01/Accounts.json" && String((r.body as { FriendlyName?: string }).FriendlyName).includes(companyId),
      );
      expect(created).toHaveLength(1); // one subaccount created for the company, not one per agent

      const mismatch = await api<{ error: string }>(
        "POST",
        connectPath(companyId, "ana"),
        owner.cookieHeader,
        connectBody({ wabaId: "some-other-waba" }),
      );
      expect(mismatch.status).toBe(409);
      expect(mismatch.json.error).toBe("whatsapp_waba_mismatch");
    });

    it("409s for a number held by another company, and by another agent unless force moves it", async () => {
      const ownerA = await signUpTestUser("owner");
      const companyA = await createCompany(ownerA.cookieHeader, "Twilio Holder A Co");
      await hire(ownerA.cookieHeader, companyA, "malu");
      await api("POST", `/api/companies/${companyA}/agents/ana`, ownerA.cookieHeader);
      const body = connectBody();
      expect((await api("POST", connectPath(companyA, "malu"), ownerA.cookieHeader, body)).status).toBe(200);

      // Another company can never take it.
      const ownerB = await signUpTestUser("owner");
      const companyB = await createCompany(ownerB.cookieHeader, "Twilio Holder B Co");
      await hire(ownerB.cookieHeader, companyB, "malu");
      const elsewhere = await api<{ error: string }>("POST", connectPath(companyB, "malu"), ownerB.cookieHeader, connectBody({ phoneNumber: body.phoneNumber }));
      expect(elsewhere.status).toBe(409);
      expect(elsewhere.json.error).toBe("whatsapp_number_connected_elsewhere");

      // Another agent of the same company gets a 409 naming the holder...
      const conflict = await api<{ error: string; agentSlug: string }>(
        "POST",
        connectPath(companyA, "ana"),
        ownerA.cookieHeader,
        { ...body },
      );
      expect(conflict.status).toBe(409);
      expect(conflict.json).toMatchObject({ error: "whatsapp_number_connected_to_other_agent", agentSlug: "malu" });

      // ...and with force the number moves, without a second sender registration.
      const sendersBefore = (await mockRequests()).filter(
        (r) => r.path === "/v2/Channels/Senders" && (r.body as { sender_id?: string }).sender_id === `whatsapp:${body.phoneNumber}`,
      ).length;
      const moved = await api<{ connection: Connection }>("POST", connectPath(companyA, "ana"), ownerA.cookieHeader, { ...body, force: true });
      expect(moved.status).toBe(200);
      const sendersAfter = (await mockRequests()).filter(
        (r) => r.path === "/v2/Channels/Senders" && (r.body as { sender_id?: string }).sender_id === `whatsapp:${body.phoneNumber}`,
      ).length;
      expect(sendersAfter).toBe(sendersBefore);

      const { data: malu } = await service.from("agents").select("id").eq("slug", "malu").single();
      const { data: released } = await service
        .from("company_whatsapp_connections")
        .select("status, twilio_sender_sid")
        .eq("company_id", companyA)
        .eq("agent_id", (malu as { id: string }).id)
        .single();
      expect(released).toMatchObject({ status: "disconnected", twilio_sender_sid: null });
    });

    it("502s without a raw Twilio error, and stores nothing, when the sender registration fails", async () => {
      const owner = await signUpTestUser("owner");
      const companyId = await createCompany(owner.cookieHeader, "Twilio Sender Failure Co");
      await hire(owner.cookieHeader, companyId, "malu");

      // +5500000000xx is the mock's "WABA problem" (63101) number range.
      const res = await api<{ error: string }>(
        "POST",
        connectPath(companyId, "malu"),
        owner.cookieHeader,
        connectBody({ phoneNumber: "+5500000000099" }),
      );
      expect(res.status).toBe(502);
      expect(res.json.error).toBe("Failed to connect WhatsApp");
      expect(JSON.stringify(res.json)).not.toContain("63101");

      const { data: rows } = await service.from("company_whatsapp_connections").select("id").eq("company_id", companyId);
      expect(rows).toHaveLength(0);
    });

    it("502s when the subaccount can't be created", async () => {
      const owner = await signUpTestUser("owner");
      const companyId = await createCompany(owner.cookieHeader, "trigger-subaccount-failure Co");
      await hire(owner.cookieHeader, companyId, "malu");

      const res = await api("POST", connectPath(companyId, "malu"), owner.cookieHeader, connectBody());
      expect(res.status).toBe(502);
      const { data: rows } = await service.from("company_whatsapp_connections").select("id").eq("company_id", companyId);
      expect(rows).toHaveLength(0);
    });
  });

  describe("GET / DELETE .../whatsapp", () => {
    it("GET refreshes a pending sender from Twilio, so the merchant sees it go live", async () => {
      const owner = await signUpTestUser("owner");
      const companyId = await createCompany(owner.cookieHeader, "Twilio Status Co");
      await hire(owner.cookieHeader, companyId, "malu");
      await api("POST", connectPath(companyId, "malu"), owner.cookieHeader, connectBody());

      const stillPending = await api<{ connection: Connection }>("GET", statusPath(companyId, "malu"), owner.cookieHeader);
      expect(stillPending.json.connection.status).toBe("pending");

      // Twilio's mock answers ONLINE for a sender sid ending "-online".
      await service.from("company_whatsapp_connections").update({ twilio_sender_sid: "XEstatus-online" }).eq("company_id", companyId);
      const live = await api<{ connection: Connection }>("GET", statusPath(companyId, "malu"), owner.cookieHeader);
      expect(live.json.connection).toMatchObject({
        status: "connected",
        sender_status: "ONLINE",
        quality_rating: "GREEN",
        messaging_limit: "TIER_1K",
      });
    });

    it("DELETE gives the sender back to Twilio and disconnects", async () => {
      const owner = await signUpTestUser("owner");
      const companyId = await createCompany(owner.cookieHeader, "Twilio Disconnect Co");
      await hire(owner.cookieHeader, companyId, "malu");
      await api("POST", connectPath(companyId, "malu"), owner.cookieHeader, connectBody());
      const { data: before } = await service.from("company_whatsapp_connections").select("twilio_sender_sid").eq("company_id", companyId).single();
      const senderSid = before!.twilio_sender_sid as string;

      const res = await api<{ connection: Connection }>("DELETE", statusPath(companyId, "malu"), owner.cookieHeader);
      expect(res.status).toBe(200);
      expect(res.json.connection.status).toBe("disconnected");

      expect((await mockRequests()).some((r) => r.method === "DELETE" && r.path === `/v2/Channels/Senders/${senderSid}`)).toBe(true);
      const { data: after } = await service.from("company_whatsapp_connections").select("twilio_sender_sid, status").eq("company_id", companyId).single();
      expect(after).toMatchObject({ status: "disconnected", twilio_sender_sid: null });
    });

    it("DELETE 502s and leaves the connection alone when Twilio can't delete the sender", async () => {
      const owner = await signUpTestUser("owner");
      const companyId = await createCompany(owner.cookieHeader, "Twilio Disconnect Fail Co");
      await hire(owner.cookieHeader, companyId, "malu");
      await api("POST", connectPath(companyId, "malu"), owner.cookieHeader, connectBody());
      await service.from("company_whatsapp_connections").update({ twilio_sender_sid: "XEstuck-fail-delete" }).eq("company_id", companyId);

      const res = await api("DELETE", statusPath(companyId, "malu"), owner.cookieHeader);
      expect(res.status).toBe(502);
      const { data: row } = await service.from("company_whatsapp_connections").select("status").eq("company_id", companyId).single();
      expect(row!.status).toBe("pending");
    });
  });

  describe("GET /api/cron/whatsapp/sync-senders", () => {
    async function cron(auth?: string) {
      return fetch(`${baseUrl}/api/cron/whatsapp/sync-senders`, { headers: auth ? { authorization: auth } : {} });
    }

    it("requires the cron bearer", async () => {
      expect((await cron()).status).toBe(401);
      expect((await cron("Bearer wrong")).status).toBe(401);
    });

    it("moves a pending sender to connected once Twilio says ONLINE, and records an OFFLINE one", async () => {
      const owner = await signUpTestUser("owner");
      const companyId = await createCompany(owner.cookieHeader, "Twilio Sync Co");
      await hire(owner.cookieHeader, companyId, "malu");
      await api("POST", `/api/companies/${companyId}/agents/ana`, owner.cookieHeader);
      const waba = `waba-${randomUUID().slice(0, 8)}`;
      await api("POST", connectPath(companyId, "malu"), owner.cookieHeader, connectBody({ wabaId: waba }));
      await api("POST", connectPath(companyId, "ana"), owner.cookieHeader, connectBody({ wabaId: waba }));

      const { data: malu } = await service.from("agents").select("id").eq("slug", "malu").single();
      const { data: ana } = await service.from("agents").select("id").eq("slug", "ana").single();
      await service.from("company_whatsapp_connections").update({ twilio_sender_sid: "XEsync-online" }).eq("company_id", companyId).eq("agent_id", (malu as { id: string }).id);
      await service.from("company_whatsapp_connections").update({ twilio_sender_sid: "XEsync-offline", status: "connected" }).eq("company_id", companyId).eq("agent_id", (ana as { id: string }).id);

      const res = await cron("Bearer test-cron-secret");
      expect(res.status).toBe(200);

      const { data: rows } = await service
        .from("company_whatsapp_connections")
        .select("agent_id, status, sender_status, connected_at")
        .eq("company_id", companyId);
      const byAgent = new Map((rows as { agent_id: string; status: string; sender_status: string; connected_at: string | null }[]).map((r) => [r.agent_id, r]));
      expect(byAgent.get((malu as { id: string }).id)).toMatchObject({ status: "connected", sender_status: "ONLINE" });
      expect(byAgent.get((malu as { id: string }).id)!.connected_at).not.toBeNull();
      // A connected sender that Twilio now reports OFFLINE stays `connected`
      // (never regresses to pending) but is recorded as offline for the gate.
      expect(byAgent.get((ana as { id: string }).id)).toMatchObject({ status: "connected", sender_status: "OFFLINE" });
    });
  });

  describe("secrets stay server-side", () => {
    it("blocks a company owner from reading company_twilio_accounts or the sender SID through PostgREST", async () => {
      const owner = await signUpTestUser("owner");
      const companyId = await createCompany(owner.cookieHeader, "Twilio RLS Co");
      await hire(owner.cookieHeader, companyId, "malu");
      expect((await api("POST", connectPath(companyId, "malu"), owner.cookieHeader, connectBody())).status).toBe(200);

      const accounts = await owner.client.from("company_twilio_accounts").select("auth_token_encrypted").eq("company_id", companyId);
      expect(accounts.error?.code).toBe("42501");

      const sid = await owner.client.from("company_whatsapp_connections").select("twilio_sender_sid").eq("company_id", companyId);
      expect(sid.error?.code).toBe("42501");

      // The non-secret Twilio columns remain readable to the company's members.
      const safe = await owner.client.from("company_whatsapp_connections").select("provider, phone_e164, sender_status").eq("company_id", companyId);
      expect(safe.error).toBeNull();
      expect(safe.data).toHaveLength(1);

      // And writes stay service-role only (20260922100000).
      const write = await owner.client.from("company_whatsapp_connections").update({ sender_status: "ONLINE" }).eq("company_id", companyId).select();
      expect(write.error?.code).toBe("42501");
    });
  });
});
