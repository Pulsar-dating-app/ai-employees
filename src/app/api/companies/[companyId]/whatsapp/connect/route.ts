import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

// Trello ticket D1 -- finishes what Meta's Embedded Signup starts. F4's (not
// yet built) dashboard screen loads the Facebook JS SDK and triggers the
// popup; on success the browser gets { code, waba_id, phone_number_id } and
// posts it here. This route does the server-to-server work: exchange the
// code for a business access token, register the number for Cloud API
// messaging, subscribe our app to the WABA's webhooks (so D2's inbound
// webhook has something to receive), and persist the result.
//
// META_GRAPH_API_BASE_URL lets tests point this at a local mock instead of
// the real Meta Graph API (the spawned test Next.js server can't share an
// in-process fetch mock with the test runner -- see tests/integration/global-setup.ts).
const GRAPH_API_BASE_URL = process.env.META_GRAPH_API_BASE_URL ?? "https://graph.facebook.com";
const GRAPH_API_VERSION = "v21.0";
const SAFE_COLUMNS =
  "phone_number_id, waba_id, display_phone_number, status, connected_at, token_expires_at";

function graphApiUrl(path: string, params?: Record<string, string>) {
  const url = new URL(`${GRAPH_API_BASE_URL}/${GRAPH_API_VERSION}${path}`);
  for (const [key, value] of Object.entries(params ?? {})) {
    url.searchParams.set(key, value);
  }
  return url.toString();
}

// Meta requires a PIN to enable two-step verification on a newly registered
// number; we control the number entirely server-side, so a random one-time
// PIN is sufficient -- nothing later re-prompts for it.
function generateRegistrationPin() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

async function requireMember(
  supabase: Awaited<ReturnType<typeof createClient>>,
  companyId: string,
  userId: string,
) {
  const { data: membership, error } = await supabase
    .from("company_users")
    .select("role")
    .eq("company_id", companyId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    return { error: NextResponse.json({ error: error.message }, { status: 500 }), role: null };
  }

  if (!membership) {
    return {
      error: NextResponse.json({ error: "Not a member of this company" }, { status: 403 }),
      role: null,
    };
  }

  return { error: null, role: membership.role as string };
}

async function requireAdmin(
  supabase: Awaited<ReturnType<typeof createClient>>,
  companyId: string,
  userId: string,
) {
  const membership = await requireMember(supabase, companyId, userId);
  if (membership.error) return membership;

  if (!["owner", "admin"].includes(membership.role!)) {
    return {
      error: NextResponse.json(
        { error: "Only company owners/admins can manage the WhatsApp connection" },
        { status: 403 },
      ),
      role: membership.role,
    };
  }

  return membership;
}

async function finishEmbeddedSignup(code: string, phoneNumberId: string, wabaId: string) {
  const tokenRes = await fetch(
    graphApiUrl("/oauth/access_token", {
      client_id: process.env.META_APP_ID!,
      client_secret: process.env.META_APP_SECRET!,
      code,
    }),
  );
  if (!tokenRes.ok) throw new Error("Meta token exchange failed");
  const { access_token: accessToken, expires_in: expiresIn } = (await tokenRes.json()) as {
    access_token?: string;
    expires_in?: number;
  };
  if (!accessToken) throw new Error("Meta token exchange returned no access_token");

  const authHeaders = { Authorization: `Bearer ${accessToken}` };

  const registerRes = await fetch(graphApiUrl(`/${phoneNumberId}/register`), {
    method: "POST",
    headers: { ...authHeaders, "content-type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", pin: generateRegistrationPin() }),
  });
  if (!registerRes.ok) throw new Error("Meta phone number registration failed");

  const subscribeRes = await fetch(graphApiUrl(`/${wabaId}/subscribed_apps`), {
    method: "POST",
    headers: authHeaders,
  });
  if (!subscribeRes.ok) throw new Error("Meta webhook subscription failed");

  const phoneRes = await fetch(
    graphApiUrl(`/${phoneNumberId}`, { fields: "display_phone_number" }),
    { headers: authHeaders },
  );
  if (!phoneRes.ok) throw new Error("Meta phone number lookup failed");
  const { display_phone_number: displayPhoneNumber } = (await phoneRes.json()) as {
    display_phone_number?: string;
  };

  return {
    accessToken,
    displayPhoneNumber: displayPhoneNumber ?? null,
    // Meta doesn't renew this automatically -- expires_in (seconds) from the
    // token exchange lets us at least record when it goes stale. No
    // auto-refresh yet (needs a scheduled job this codebase doesn't have
    // any precedent for, and nothing reads this token yet -- see decisions.md).
    tokenExpiresAt: expiresIn ? new Date(Date.now() + expiresIn * 1000).toISOString() : null,
  };
}

// POST: admin-only. Body: { code, phoneNumberId, wabaId } -- exactly what
// Embedded Signup hands the browser on success. Upserts on company_id, so
// reconnecting (retry, re-running the popup) is idempotent rather than a
// conflict -- same convention as B1's hire endpoint. Goes straight through
// the service client: access_token is column-privilege-locked for the
// regular admin client (migration 20260826104820), so writing it requires
// bypassing that grant -- simplest to write the whole row in one call.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ companyId: string }> },
) {
  const { companyId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const adminCheck = await requireAdmin(supabase, companyId, user.id);
  if (adminCheck.error) return adminCheck.error;

  const body = await request.json().catch(() => null);
  const code = typeof body?.code === "string" ? body.code : "";
  const phoneNumberId = typeof body?.phoneNumberId === "string" ? body.phoneNumberId : "";
  const wabaId = typeof body?.wabaId === "string" ? body.wabaId : "";

  if (!code || !phoneNumberId || !wabaId) {
    return NextResponse.json(
      { error: "code, phoneNumberId, and wabaId are required" },
      { status: 400 },
    );
  }

  let accessToken: string;
  let displayPhoneNumber: string | null;
  let tokenExpiresAt: string | null;
  try {
    ({ accessToken, displayPhoneNumber, tokenExpiresAt } = await finishEmbeddedSignup(
      code,
      phoneNumberId,
      wabaId,
    ));
  } catch {
    // Never leak Meta's raw error text to the merchant-facing UI.
    return NextResponse.json({ error: "Failed to connect WhatsApp" }, { status: 502 });
  }

  const serviceClient = createServiceClient();
  const { data: connection, error } = await serviceClient
    .from("company_whatsapp_connections")
    .upsert(
      {
        company_id: companyId,
        phone_number_id: phoneNumberId,
        waba_id: wabaId,
        display_phone_number: displayPhoneNumber,
        status: "connected",
        access_token: accessToken,
        token_expires_at: tokenExpiresAt,
        connected_at: new Date().toISOString(),
      },
      { onConflict: "company_id" },
    )
    .select(SAFE_COLUMNS)
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ connection });
}
