import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { getTestEnv } from "./helpers/env";
import { getTestServiceClient } from "./helpers/service-client";
import { signUpTestUser } from "./helpers/auth";
import { api } from "./helpers/request";

// Trello N6. The pg_cron schedule itself (the migration) is a
// production-only concern -- it's guarded on Vault secrets that don't
// exist locally, so `supabase db reset` runs it to a no-op. What matters
// and what's testable is the route it triggers: given connections in
// various states, does it refresh the ones near expiry and disconnect the
// ones whose refresh fails? Instagram's refresh endpoint is stood in for
// by instagram-api-mock.ts (access_token containing "trigger-refresh-
// failure" -> 400); everything else is the real local Supabase stack,
// including the column-privilege lock on access_token (only the
// service-role client can read/write it).
const CRON_PATH = "/api/cron/instagram/refresh-tokens";
// Must match global-setup.ts's spawned-server env.
const CRON_SECRET = "test-cron-secret";

async function callCron(secret?: string) {
  const { baseUrl } = getTestEnv();
  const res = await fetch(baseUrl + CRON_PATH, {
    method: "POST",
    headers: secret ? { authorization: `Bearer ${secret}` } : {},
  });
  const json = (await res.json().catch(() => null)) as
    | { checked: number; refreshed: number; disconnected: number }
    | { error: string }
    | null;
  return { status: res.status, json };
}

async function seedConnection(opts: {
  status?: "connected" | "disconnected";
  accessToken: string | null;
  expiresInDays: number | null;
}) {
  const svc = getTestServiceClient();
  const owner = await signUpTestUser("cron-owner");
  const created = await api<{ company: { id: string } }>("POST", "/api/companies", owner.cookieHeader, {
    name: `Cron IG Co ${randomUUID()}`,
  });
  const companyId = created.json.company.id;

  const { data: agent } = await svc.from("agents").select("id").eq("slug", "malu").single();

  const tokenExpiresAt =
    opts.expiresInDays === null
      ? null
      : new Date(Date.now() + opts.expiresInDays * 24 * 60 * 60 * 1000).toISOString();

  const { data: row, error } = await svc
    .from("company_instagram_connections")
    .insert({
      company_id: companyId,
      agent_id: agent!.id,
      // Random per row: the N1 partial unique index on instagram_user_id
      // (where status <> 'disconnected') would otherwise collide across tests.
      instagram_user_id: `cron_${randomUUID()}`,
      status: opts.status ?? "connected",
      access_token: opts.accessToken,
      token_expires_at: tokenExpiresAt,
      connected_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (error) throw error;

  return { connectionId: row!.id as string, svc };
}

async function readConnection(
  svc: ReturnType<typeof getTestServiceClient>,
  id: string,
) {
  const { data } = await svc
    .from("company_instagram_connections")
    .select("status, access_token, token_expires_at")
    .eq("id", id)
    .single();
  return data as { status: string; access_token: string | null; token_expires_at: string | null };
}

describe("Instagram token refresh cron (N6)", () => {
  it("rejects a call with no bearer or the wrong secret", async () => {
    expect((await callCron()).status).toBe(401);
    expect((await callCron("not-the-secret")).status).toBe(401);
  });

  it("refreshes a connected token expiring inside the 7-day window", async () => {
    const { connectionId, svc } = await seedConnection({ accessToken: "old-token-near-expiry", expiresInDays: 3 });

    const res = await callCron(CRON_SECRET);
    expect(res.status).toBe(200);

    const row = await readConnection(svc, connectionId);
    expect(row.status).toBe("connected");
    expect(row.access_token).toBe("mock-refreshed-token");
    // ~60 days out again -- and therefore back outside the window, so a
    // re-run is a no-op.
    expect(new Date(row.token_expires_at!).getTime()).toBeGreaterThan(Date.now() + 30 * 24 * 60 * 60 * 1000);
  });

  it("leaves a healthy token (expiry well outside the window) untouched", async () => {
    const { connectionId, svc } = await seedConnection({ accessToken: "healthy-token", expiresInDays: 40 });

    expect((await callCron(CRON_SECRET)).status).toBe(200);

    const row = await readConnection(svc, connectionId);
    expect(row.access_token).toBe("healthy-token");
    expect(row.status).toBe("connected");
  });

  it("disconnects a connection whose refresh is rejected by Meta", async () => {
    const { connectionId, svc } = await seedConnection({
      accessToken: "trigger-refresh-failure-token",
      expiresInDays: 1,
    });

    const res = await callCron(CRON_SECRET);
    expect(res.status).toBe(200);

    const row = await readConnection(svc, connectionId);
    expect(row.status).toBe("disconnected");
    expect(row.access_token).toBeNull();
    expect(row.token_expires_at).toBeNull();
  });

  it("ignores a disconnected connection even when its expiry is inside the window", async () => {
    const { connectionId, svc } = await seedConnection({
      status: "disconnected",
      accessToken: null,
      expiresInDays: 2,
    });

    expect((await callCron(CRON_SECRET)).status).toBe(200);

    const row = await readConnection(svc, connectionId);
    expect(row.status).toBe("disconnected");
  });
});
