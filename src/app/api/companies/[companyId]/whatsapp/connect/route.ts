import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import {
  exchangeCodeForToken,
  finishConnection,
  generateRegistrationPin,
} from "@/lib/whatsapp/meta-graph-api";

// Trello ticket D1 -- finishes what Meta's Embedded Signup starts. F4's (not
// yet built) dashboard screen loads the Facebook JS SDK and triggers the
// popup; on success the browser gets { code, waba_id, phone_number_id } and
// posts it here. This route does the server-to-server work: exchange the
// code for a business access token, register the number for Cloud API
// messaging, subscribe our app to the WABA's webhooks (so D2's inbound
// webhook has something to receive), and persist the result.
const SAFE_COLUMNS =
  "phone_number_id, waba_id, display_phone_number, status, connected_at, token_expires_at";

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

async function finishEmbeddedSignup(code: string, phoneNumberId: string, wabaId: string, pin: string) {
  const { accessToken, tokenExpiresAt } = await exchangeCodeForToken(code);
  const { displayPhoneNumber } = await finishConnection(accessToken, phoneNumberId, wabaId, pin);
  return { accessToken, displayPhoneNumber, tokenExpiresAt };
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

  const serviceClient = createServiceClient();

  // Reuse the PIN from a prior connection attempt if one exists -- Meta
  // ties a phone number to a PIN on its first /register call and rejects
  // any later /register with a different one ("PIN Mismatch"), so a
  // reconnect must supply the same PIN, not a fresh random one.
  const { data: existing } = await serviceClient
    .from("company_whatsapp_connections")
    .select("two_step_pin")
    .eq("company_id", companyId)
    .maybeSingle();
  const pin = existing?.two_step_pin ?? generateRegistrationPin();

  let accessToken: string;
  let displayPhoneNumber: string | null;
  let tokenExpiresAt: string | null;
  try {
    ({ accessToken, displayPhoneNumber, tokenExpiresAt } = await finishEmbeddedSignup(
      code,
      phoneNumberId,
      wabaId,
      pin,
    ));
  } catch {
    // Never leak Meta's raw error text to the merchant-facing UI.
    return NextResponse.json({ error: "Failed to connect WhatsApp" }, { status: 502 });
  }

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
        two_step_pin: pin,
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
