import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { finishConnection, generateRegistrationPin } from "@/lib/whatsapp/meta-graph-api";

// TODO(D1-TEST-ONLY): delete this file once D7's Embedded Signup Advanced
// Access is approved -- it exists purely to unblock manual testing before
// that approval comes through. Nested under [agentSlug] now, mirroring the
// real connect route's 2026-09-04 per-agent move (migration
// 20260905090000).
//
// TEMPORARY DEV-ONLY ROUTE -- Trello D1/D7.
//
// Lets D2/D4 be validated against the real Meta Graph API before the app's
// Embedded Signup access is approved. Meta gives every app a free test
// WhatsApp number under WhatsApp -> API Setup with its own access token,
// phone_number_id, and waba_id, with no approval needed since it's the
// developer's own test setup. This route takes those pasted-in values
// directly instead of a code, and does the exact same
// register/subscribe/lookup/upsert as the real POST .../whatsapp/connect --
// only the code-exchange step is skipped, since there's already a token.

const SAFE_COLUMNS =
  "phone_number_id, waba_id, display_phone_number, status, connected_at, token_expires_at, has_payment_issue, payment_issue_detected_at";

async function requireAdmin(
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

  if (error) return { error: NextResponse.json({ error: error.message }, { status: 500 }) };
  if (!membership) {
    return { error: NextResponse.json({ error: "Not a member of this company" }, { status: 403 }) };
  }
  if (!["owner", "admin"].includes(membership.role)) {
    return {
      error: NextResponse.json(
        { error: "Only company owners/admins can manage the WhatsApp connection" },
        { status: 403 },
      ),
    };
  }
  return { error: null };
}

async function resolveAgentId(
  supabase: Awaited<ReturnType<typeof createClient>>,
  companyId: string,
  agentSlug: string,
) {
  const { data: agent, error: agentError } = await supabase
    .from("agents")
    .select("id")
    .eq("slug", agentSlug)
    .eq("is_active", true)
    .maybeSingle();
  if (agentError) {
    return { error: NextResponse.json({ error: agentError.message }, { status: 500 }), agentId: null };
  }
  if (!agent) {
    return { error: NextResponse.json({ error: "Agent not found" }, { status: 404 }), agentId: null };
  }

  const { data: companyAgent, error: companyAgentError } = await supabase
    .from("company_agents")
    .select("id")
    .eq("company_id", companyId)
    .eq("agent_id", agent.id)
    .maybeSingle();
  if (companyAgentError) {
    return { error: NextResponse.json({ error: companyAgentError.message }, { status: 500 }), agentId: null };
  }
  if (!companyAgent) {
    return {
      error: NextResponse.json({ error: "This company hasn't hired this agent" }, { status: 400 }),
      agentId: null,
    };
  }

  return { error: null, agentId: agent.id as string };
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ companyId: string; agentSlug: string }> },
) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { companyId, agentSlug } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const adminCheck = await requireAdmin(supabase, companyId, user.id);
  if (adminCheck.error) return adminCheck.error;

  const agentCheck = await resolveAgentId(supabase, companyId, agentSlug);
  if (agentCheck.error) return agentCheck.error;

  const body = await request.json().catch(() => null);
  const accessToken = typeof body?.accessToken === "string" ? body.accessToken : "";
  const phoneNumberId = typeof body?.phoneNumberId === "string" ? body.phoneNumberId : "";
  const wabaId = typeof body?.wabaId === "string" ? body.wabaId : "";

  if (!accessToken || !phoneNumberId || !wabaId) {
    return NextResponse.json(
      { error: "accessToken, phoneNumberId, and wabaId are required" },
      { status: 400 },
    );
  }

  const serviceClient = createServiceClient();

  // Same PIN-reuse requirement as the real connect route -- see
  // meta-graph-api.ts's generateRegistrationPin doc comment.
  const { data: existing } = await serviceClient
    .from("company_whatsapp_connections")
    .select("two_step_pin")
    .eq("phone_number_id", phoneNumberId)
    .maybeSingle();
  const pin = existing?.two_step_pin ?? generateRegistrationPin();

  let displayPhoneNumber: string | null;
  try {
    ({ displayPhoneNumber } = await finishConnection(accessToken, phoneNumberId, wabaId, pin));
  } catch (err) {
    // Dev-only route -- safe to surface Meta's raw error here (unlike the
    // real connect route) so it's actually debuggable from the test page.
    return NextResponse.json(
      { error: "Failed to connect WhatsApp", detail: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    );
  }

  const { data: connection, error } = await serviceClient
    .from("company_whatsapp_connections")
    .upsert(
      {
        company_id: companyId,
        agent_id: agentCheck.agentId,
        phone_number_id: phoneNumberId,
        waba_id: wabaId,
        display_phone_number: displayPhoneNumber,
        status: "connected",
        access_token: accessToken,
        // Meta's test-number tokens from API Setup are typically short-lived
        // (~24h) unless exchanged for a System User token -- not tracked
        // precisely here since this path is throwaway.
        token_expires_at: null,
        two_step_pin: pin,
        connected_at: new Date().toISOString(),
        has_payment_issue: false,
        payment_issue_detected_at: null,
      },
      { onConflict: "company_id,agent_id" },
    )
    .select(SAFE_COLUMNS)
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ connection });
}
