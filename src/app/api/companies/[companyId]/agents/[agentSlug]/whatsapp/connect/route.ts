import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import {
  exchangeCodeForToken,
  finishConnection,
  generateRegistrationPin,
} from "@/lib/whatsapp/meta-graph-api";

// Trello D1 amendment (2026-09-04) -- finishes what Meta's Embedded Signup
// starts, now nested under [agentSlug] since migration 20260905090000 made
// company_whatsapp_connections per-agent. D6's dashboard card loads the
// Facebook JS SDK and triggers the popup on this agent's page; on success
// the browser gets { code, waba_id, phone_number_id } and posts it here.
// This route does the server-to-server work: exchange the code for a
// business access token, register the number for Cloud API messaging,
// subscribe our app to the WABA's webhooks (so D2's inbound webhook has
// something to receive), and persist the result.
//
// One WhatsApp number answers exactly one agent, platform-wide (the partial
// unique index on phone_number_id). Same two conflict shapes N2 handles for
// Instagram accounts:
//   - the number is already held by a DIFFERENT agent in THIS company: with
//     force=true, that connection is released first and this one takes it
//     over -- an admin moving their own asset between their own hires is
//     safe to do in one step. Without force, a 409 names who holds it.
//   - the number is held by ANOTHER company entirely: always a 409, never
//     auto-resolved -- that would mean reassigning something this caller
//     doesn't own.
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

async function resolveAgent(
  supabase: Awaited<ReturnType<typeof createClient>>,
  companyId: string,
  agentSlug: string,
) {
  const { data: agent, error: agentError } = await supabase
    .from("agents")
    .select("id, slug")
    .eq("slug", agentSlug)
    .eq("is_active", true)
    .maybeSingle();
  if (agentError) return { error: NextResponse.json({ error: agentError.message }, { status: 500 }), agent: null };
  if (!agent) return { error: NextResponse.json({ error: "Agent not found" }, { status: 404 }), agent: null };

  const { data: companyAgent, error: companyAgentError } = await supabase
    .from("company_agents")
    .select("id")
    .eq("company_id", companyId)
    .eq("agent_id", agent.id)
    .maybeSingle();
  if (companyAgentError) {
    return { error: NextResponse.json({ error: companyAgentError.message }, { status: 500 }), agent: null };
  }
  if (!companyAgent) {
    return {
      error: NextResponse.json({ error: "This company hasn't hired this agent" }, { status: 400 }),
      agent: null,
    };
  }

  return { error: null, agent };
}

async function finishEmbeddedSignup(code: string, phoneNumberId: string, wabaId: string, pin: string) {
  const { accessToken, tokenExpiresAt } = await exchangeCodeForToken(code);
  const { displayPhoneNumber } = await finishConnection(accessToken, phoneNumberId, wabaId, pin);
  return { accessToken, displayPhoneNumber, tokenExpiresAt };
}

// POST: admin-only. Body: { code, phoneNumberId, wabaId, force? } -- exactly
// what Embedded Signup hands the browser on success, plus the same `force`
// flag N2 introduced. Upserts on (company_id, agent_id), so reconnecting is
// idempotent -- same convention as D1's original route.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ companyId: string; agentSlug: string }> },
) {
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

  const agentCheck = await resolveAgent(supabase, companyId, agentSlug);
  if (agentCheck.error) return agentCheck.error;
  const agent = agentCheck.agent!;

  const body = await request.json().catch(() => null);
  const code = typeof body?.code === "string" ? body.code : "";
  const phoneNumberId = typeof body?.phoneNumberId === "string" ? body.phoneNumberId : "";
  const wabaId = typeof body?.wabaId === "string" ? body.wabaId : "";
  const force = body?.force === true;

  if (!code || !phoneNumberId || !wabaId) {
    return NextResponse.json(
      { error: "code, phoneNumberId, and wabaId are required" },
      { status: 400 },
    );
  }

  const serviceClient = createServiceClient();

  // Check for a live holder of this number before writing -- turns the
  // unique-index violation into an answer the UI can act on, rather than a
  // raw 23505 surfacing as a 500.
  const { data: holder, error: holderError } = await serviceClient
    .from("company_whatsapp_connections")
    .select("id, company_id, agent_id, two_step_pin")
    .eq("phone_number_id", phoneNumberId)
    .neq("status", "disconnected")
    .maybeSingle();
  if (holderError) {
    return NextResponse.json({ error: holderError.message }, { status: 500 });
  }

  if (holder && holder.company_id !== companyId) {
    return NextResponse.json({ error: "whatsapp_number_connected_elsewhere" }, { status: 409 });
  }

  if (holder && holder.agent_id !== agent.id) {
    if (!force) {
      const { data: holdingAgent } = await supabase.from("agents").select("slug").eq("id", holder.agent_id).maybeSingle();
      return NextResponse.json(
        { error: "whatsapp_number_connected_to_other_agent", agentSlug: holdingAgent?.slug ?? null },
        { status: 409 },
      );
    }

    const { error: releaseError } = await serviceClient
      .from("company_whatsapp_connections")
      .update({ status: "disconnected", access_token: null, token_expires_at: null })
      .eq("id", holder.id);
    if (releaseError) {
      return NextResponse.json({ error: releaseError.message }, { status: 500 });
    }
  }

  // Reuse the PIN from a prior connection attempt for this exact number if
  // one exists -- Meta ties a phone number to a PIN on its first /register
  // call and rejects any later /register with a different one ("PIN
  // Mismatch"), so a reconnect (including one moved over via `force`) must
  // supply the same PIN, not a fresh random one.
  const { data: existing } = await serviceClient
    .from("company_whatsapp_connections")
    .select("two_step_pin")
    .eq("phone_number_id", phoneNumberId)
    .maybeSingle();
  const pin = existing?.two_step_pin ?? holder?.two_step_pin ?? generateRegistrationPin();

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
        agent_id: agent.id,
        phone_number_id: phoneNumberId,
        waba_id: wabaId,
        display_phone_number: displayPhoneNumber,
        status: "connected",
        access_token: accessToken,
        token_expires_at: tokenExpiresAt,
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
