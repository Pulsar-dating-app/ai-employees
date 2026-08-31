import { describe, expect, it } from "vitest";
import { api } from "./helpers/request";
import { getTestEnv } from "./helpers/env";
import { signUpTestUser } from "./helpers/auth";
import { encodeState, generateNonce, OAUTH_STATE_COOKIE } from "@/lib/instagram/oauth-state";

// Trello N3: the two entry/exit points of the redirect-based OAuth flow --
// /connect/start (the "Connect Instagram" link's target) and the shared
// /dashboard/my-agents/instagram-callback route. Both intentionally return
// HTTP redirects, not JSON, so this uses raw fetch(redirect: "manual")
// rather than the api() helper (which follows redirects and would hide the
// Location/Set-Cookie headers under test). state/nonce are constructed
// directly via oauth-state.ts's own helpers rather than by first calling
// /start and parsing its Location -- they're pure functions, so a
// self-built state is exactly what /start would have produced, and this
// decouples "does /start redirect correctly" from "does /callback validate
// correctly".
describe("Instagram connect UI entry points (start, callback)", () => {
  const { baseUrl } = getTestEnv();

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

  function startPath(companyId: string, agentSlug: string) {
    return `/api/companies/${companyId}/agents/${agentSlug}/instagram/connect/start`;
  }

  async function rawGet(path: string, cookieHeader?: string) {
    return fetch(baseUrl + path, {
      redirect: "manual",
      headers: cookieHeader ? { cookie: cookieHeader } : undefined,
    });
  }

  function setCookieNonce(res: Response): string | null {
    // Node's fetch exposes multiple Set-Cookie headers via getSetCookie();
    // find the one this flow actually sets.
    const raw = typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : [];
    const match = raw.find((c) => c.startsWith(`${OAUTH_STATE_COOKIE}=`));
    return match ? match.split(";")[0].split("=")[1] : null;
  }

  describe("GET .../instagram/connect/start", () => {
    it("requires authentication", async () => {
      const owner = await signUpTestUser("owner");
      const companyId = await createCompany(owner.cookieHeader, "Auth Check Start Co");
      await hireAgent(owner.cookieHeader, companyId, "malu");

      const res = await rawGet(startPath(companyId, "malu"));
      expect(res.status).toBe(401);
    });

    it("blocks a plain member (read-only, not admin)", async () => {
      const owner = await signUpTestUser("owner");
      const member = await signUpTestUser("member");
      const companyId = await createCompany(owner.cookieHeader, "Member Start Co");
      await hireAgent(owner.cookieHeader, companyId, "malu");
      await addMember(owner.cookieHeader, companyId, member.userId);

      const res = await rawGet(startPath(companyId, "malu"), member.cookieHeader);
      expect(res.status).toBe(403);
    });

    it("404s for a slug that isn't a real agent, 400s for one this company hasn't hired", async () => {
      const owner = await signUpTestUser("owner");
      const companyId = await createCompany(owner.cookieHeader, "Unhired Start Co");

      expect((await rawGet(startPath(companyId, "not-a-real-agent"), owner.cookieHeader)).status).toBe(404);
      expect((await rawGet(startPath(companyId, "ana"), owner.cookieHeader)).status).toBe(400);
    });

    it("redirects an admin to Instagram's authorize endpoint with a state cookie", async () => {
      const owner = await signUpTestUser("owner");
      const companyId = await createCompany(owner.cookieHeader, "Redirect Start Co");
      await hireAgent(owner.cookieHeader, companyId, "malu");

      const res = await rawGet(startPath(companyId, "malu"), owner.cookieHeader);
      expect(res.status).toBe(302);

      const location = new URL(res.headers.get("location")!);
      // The host is the mocked INSTAGRAM_API_BASE_URL in tests (global-setup.ts),
      // not the real www.instagram.com -- only the path/query are asserted.
      expect(location.pathname).toBe("/oauth/authorize");
      expect(location.searchParams.get("response_type")).toBe("code");
      expect(location.searchParams.get("scope")).toBe("instagram_business_basic,instagram_business_manage_messages");

      const state = JSON.parse(Buffer.from(location.searchParams.get("state")!, "base64url").toString("utf-8"));
      expect(state.companyId).toBe(companyId);
      expect(state.agentSlug).toBe("malu");
      expect(typeof state.nonce).toBe("string");

      // The nonce embedded in `state` must match the cookie the callback
      // will read back -- that pairing is the entire CSRF protection.
      expect(setCookieNonce(res)).toBe(state.nonce);
    });
  });

  describe("GET /dashboard/my-agents/instagram-callback", () => {
    function callbackUrl(params: Record<string, string>) {
      return `/dashboard/my-agents/instagram-callback?${new URLSearchParams(params)}`;
    }

    async function validState(companyId: string, agentSlug: string) {
      const nonce = generateNonce();
      const state = encodeState({ companyId, agentSlug, nonce });
      return { state, nonce };
    }

    it("rejects a missing/mismatched state as invalid, without trusting any agentSlug", async () => {
      const owner = await signUpTestUser("owner");
      const companyId = await createCompany(owner.cookieHeader, "Bad State Co");
      await hireAgent(owner.cookieHeader, companyId, "malu");

      const { state } = await validState(companyId, "malu");
      // No ig_oauth_nonce cookie sent at all -- the nonce check has nothing
      // to compare against.
      const res = await rawGet(
        callbackUrl({ code: "irrelevant", state }),
        owner.cookieHeader,
      );
      expect(res.status).toBe(302);
      const location = new URL(res.headers.get("location")!, baseUrl);
      expect(location.pathname).toBe("/dashboard/my-agents");
      expect(location.searchParams.get("instagram_error")).toBe("invalid_state");
    });

    it("rejects a state whose nonce doesn't match the cookie", async () => {
      const owner = await signUpTestUser("owner");
      const companyId = await createCompany(owner.cookieHeader, "Mismatched Nonce Co");
      await hireAgent(owner.cookieHeader, companyId, "malu");

      const { state } = await validState(companyId, "malu");
      const res = await rawGet(
        callbackUrl({ code: "irrelevant", state }),
        `${owner.cookieHeader}; ${OAUTH_STATE_COOKIE}=some-other-nonce`,
      );
      const location = new URL(res.headers.get("location")!, baseUrl);
      expect(location.searchParams.get("instagram_error")).toBe("invalid_state");
    });

    it("reports a denied authorization without ever exchanging a code", async () => {
      const owner = await signUpTestUser("owner");
      const companyId = await createCompany(owner.cookieHeader, "Denied Co");
      await hireAgent(owner.cookieHeader, companyId, "malu");

      const { state, nonce } = await validState(companyId, "malu");
      const res = await rawGet(
        callbackUrl({ error: "access_denied", state }),
        `${owner.cookieHeader}; ${OAUTH_STATE_COOKIE}=${nonce}`,
      );
      const location = new URL(res.headers.get("location")!, baseUrl);
      expect(location.pathname).toBe("/dashboard/my-agents/malu");
      expect(location.searchParams.get("instagram_error")).toBe("denied");
    });

    it("reports a missing code as an error", async () => {
      const owner = await signUpTestUser("owner");
      const companyId = await createCompany(owner.cookieHeader, "Missing Code Co");
      await hireAgent(owner.cookieHeader, companyId, "malu");

      const { state, nonce } = await validState(companyId, "malu");
      const res = await rawGet(
        callbackUrl({ state }),
        `${owner.cookieHeader}; ${OAUTH_STATE_COOKIE}=${nonce}`,
      );
      const location = new URL(res.headers.get("location")!, baseUrl);
      expect(location.searchParams.get("instagram_error")).toBe("missing_code");
    });

    it("connects on a valid code/state/nonce and redirects with a success flag", async () => {
      const owner = await signUpTestUser("owner");
      const companyId = await createCompany(owner.cookieHeader, "Full Callback Co");
      await hireAgent(owner.cookieHeader, companyId, "malu");

      const { state, nonce } = await validState(companyId, "malu");
      const res = await rawGet(
        callbackUrl({ code: "callback-success", state }),
        `${owner.cookieHeader}; ${OAUTH_STATE_COOKIE}=${nonce}`,
      );
      expect(res.status).toBe(302);
      const location = new URL(res.headers.get("location")!, baseUrl);
      expect(location.pathname).toBe("/dashboard/my-agents/malu");
      expect(location.searchParams.get("instagram")).toBe("connected");

      const status = await api<{ connection: { status: string; instagram_user_id: string } | null }>(
        "GET",
        `/api/companies/${companyId}/agents/malu/instagram`,
        owner.cookieHeader,
      );
      expect(status.json.connection?.status).toBe("connected");
      expect(status.json.connection?.instagram_user_id).toBe("igid_callback-success");
    });

    it("surfaces the Meta round trip failing as connect_failed", async () => {
      const owner = await signUpTestUser("owner");
      const companyId = await createCompany(owner.cookieHeader, "Callback Fail Co");
      await hireAgent(owner.cookieHeader, companyId, "malu");

      const { state, nonce } = await validState(companyId, "malu");
      const res = await rawGet(
        callbackUrl({ code: "trigger-token-failure", state }),
        `${owner.cookieHeader}; ${OAUTH_STATE_COOKIE}=${nonce}`,
      );
      const location = new URL(res.headers.get("location")!, baseUrl);
      expect(location.searchParams.get("instagram_error")).toBe("connect_failed");
    });

    it("auto-moves an account held by another agent in the SAME company (force is always on for this flow)", async () => {
      const owner = await signUpTestUser("owner");
      const companyId = await createCompany(owner.cookieHeader, "Callback Move Co");
      await hireAgent(owner.cookieHeader, companyId, "malu");
      await hireAgent(owner.cookieHeader, companyId, "ana");

      await api("POST", `/api/companies/${companyId}/agents/malu/instagram/connect`, owner.cookieHeader, {
        code: "callback-shared-account",
      });

      const { state, nonce } = await validState(companyId, "ana");
      const res = await rawGet(
        callbackUrl({ code: "callback-shared-account", state }),
        `${owner.cookieHeader}; ${OAUTH_STATE_COOKIE}=${nonce}`,
      );
      const location = new URL(res.headers.get("location")!, baseUrl);
      // Not a conflict: the callback always sends force: true, so this
      // moves cleanly instead of coming back as connected_to_other_agent.
      expect(location.searchParams.get("instagram")).toBe("connected");

      const maluStatus = await api<{ connection: { status: string } | null }>(
        "GET",
        `/api/companies/${companyId}/agents/malu/instagram`,
        owner.cookieHeader,
      );
      expect(maluStatus.json.connection?.status).toBe("disconnected");
    });

    it("still refuses an account held by a DIFFERENT company", async () => {
      const first = await signUpTestUser("first");
      const second = await signUpTestUser("second");
      const firstCompany = await createCompany(first.cookieHeader, "Callback Contested A");
      const secondCompany = await createCompany(second.cookieHeader, "Callback Contested B");
      await hireAgent(first.cookieHeader, firstCompany, "malu");
      await hireAgent(second.cookieHeader, secondCompany, "malu");

      await api("POST", `/api/companies/${firstCompany}/agents/malu/instagram/connect`, first.cookieHeader, {
        code: "callback-cross-company",
      });

      const { state, nonce } = await validState(secondCompany, "malu");
      const res = await rawGet(
        callbackUrl({ code: "callback-cross-company", state }),
        `${second.cookieHeader}; ${OAUTH_STATE_COOKIE}=${nonce}`,
      );
      const location = new URL(res.headers.get("location")!, baseUrl);
      expect(location.searchParams.get("instagram_error")).toBe("connected_elsewhere");
    });
  });
});
