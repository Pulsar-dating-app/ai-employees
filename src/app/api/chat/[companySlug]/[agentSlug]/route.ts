import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { AgentEngine } from "@/lib/agent-engine";
import { resolveWebChatSession } from "@/lib/web-chat/session";
import { isEmbedOriginAllowed } from "@/lib/web-chat/embed-authorization";
import { checkAndRecordIpRateLimit, checkConversationRateLimit, getClientIp } from "@/lib/web-chat/rate-limit";

// Trello M3 -- the public, unauthenticated chat API a website visitor (or
// the embeddable widget, M5) talks to. Public and slug-based, so it lives
// outside the merchant-authenticated /api/companies/ namespace entirely --
// same precedent as /c/[trackingId] (Trello E1): service-role client
// throughout, untrusted input used only as a lookup key. Excluded from
// src/proxy.ts's session-refresh middleware for the same reason /c/ is.
//
// Authorization order, all before any OpenAI call: (1) the target agent
// must be actively hired (company_agents.status === 'active') -- a lapsed
// or non-existent hire silently disables the chat, no separate billing
// system needed; (2) an embedded request's origin must be on the company's
// allowlist (deny-by-default -- see embed-authorization.ts); (3) rate
// limits (see rate-limit.ts). See the 2026-08-30 decisions.md entry for why
// each layer exists and what it does/doesn't stop.

const SESSION_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_MESSAGE_LENGTH = 4000;

type ResolvedChatTarget = { companyId: string; agentId: string };

async function resolveCompanyAndAgent(
  supabase: ReturnType<typeof createServiceClient>,
  companySlug: string,
  agentSlug: string,
  embeddedOn: string | null,
): Promise<{ error: NextResponse } | { error: null; target: ResolvedChatTarget }> {
  const { data: company, error: companyError } = await supabase
    .from("companies")
    .select("id, allowed_embed_domains")
    .eq("slug", companySlug)
    .maybeSingle();
  if (companyError) return { error: NextResponse.json({ error: companyError.message }, { status: 500 }) };
  if (!company) return { error: NextResponse.json({ error: "Not found" }, { status: 404 }) };

  const { data: agent, error: agentError } = await supabase
    .from("agents")
    .select("id")
    .eq("slug", agentSlug)
    .eq("is_active", true)
    .maybeSingle();
  if (agentError) return { error: NextResponse.json({ error: agentError.message }, { status: 500 }) };
  if (!agent) return { error: NextResponse.json({ error: "Not found" }, { status: 404 }) };

  const { data: companyAgent, error: companyAgentError } = await supabase
    .from("company_agents")
    .select("status")
    .eq("company_id", company.id)
    .eq("agent_id", agent.id)
    .maybeSingle();
  if (companyAgentError) {
    return { error: NextResponse.json({ error: companyAgentError.message }, { status: 500 }) };
  }
  if (!companyAgent || companyAgent.status !== "active") {
    return { error: NextResponse.json({ error: "This chat is not available" }, { status: 403 }) };
  }

  if (!isEmbedOriginAllowed(embeddedOn, (company.allowed_embed_domains ?? []) as string[])) {
    return { error: NextResponse.json({ error: "This chat is not available on this site" }, { status: 403 }) };
  }

  return { error: null, target: { companyId: company.id, agentId: agent.id } };
}

// GET ?sessionId=...&embeddedOn=... -- loads history across every
// conversation for this customer+agent pair, not just the current active
// one. Conversation rotation (the 24h TTL) is an invisible implementation
// detail -- a visitor refreshing right after a rotation boundary shouldn't
// see their history reset.
export async function GET(
  request: Request,
  { params }: { params: Promise<{ companySlug: string; agentSlug: string }> },
) {
  const { companySlug, agentSlug } = await params;
  const { searchParams } = new URL(request.url);
  const sessionId = searchParams.get("sessionId") ?? "";
  const embeddedOn = searchParams.get("embeddedOn");

  if (!SESSION_ID_PATTERN.test(sessionId)) {
    return NextResponse.json({ error: "sessionId is required" }, { status: 400 });
  }

  const supabase = createServiceClient();
  const resolved = await resolveCompanyAndAgent(supabase, companySlug, agentSlug, embeddedOn);
  if (resolved.error) return resolved.error;
  const { companyId, agentId } = resolved.target;

  const { data: customer, error: customerError } = await supabase
    .from("customers")
    .select("id")
    .eq("company_id", companyId)
    .eq("web_chat_session_id", sessionId)
    .maybeSingle();
  if (customerError) return NextResponse.json({ error: customerError.message }, { status: 500 });
  if (!customer) return NextResponse.json({ messages: [] });

  const { data: messages, error: messagesError } = await supabase
    .from("messages")
    .select("role, content, created_at, conversations!inner(customer_id, agent_id)")
    .eq("conversations.customer_id", customer.id)
    .eq("conversations.agent_id", agentId)
    .order("created_at", { ascending: true });
  if (messagesError) return NextResponse.json({ error: messagesError.message }, { status: 500 });

  return NextResponse.json({
    messages: (messages ?? []).map((m) => ({ role: m.role, content: m.content, created_at: m.created_at })),
  });
}

// POST { sessionId, message, embeddedOn? } -- sends a message and returns
// the agent's reply in the same response. No queue, no webhook.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ companySlug: string; agentSlug: string }> },
) {
  const { companySlug, agentSlug } = await params;
  const body = await request.json().catch(() => null);

  const sessionId = typeof body?.sessionId === "string" ? body.sessionId : "";
  if (!SESSION_ID_PATTERN.test(sessionId)) {
    return NextResponse.json({ error: "sessionId is required" }, { status: 400 });
  }

  const message = typeof body?.message === "string" ? body.message.trim() : "";
  if (!message) {
    return NextResponse.json({ error: "message is required" }, { status: 400 });
  }
  if (message.length > MAX_MESSAGE_LENGTH) {
    return NextResponse.json({ error: `message must be ${MAX_MESSAGE_LENGTH} characters or fewer` }, { status: 400 });
  }

  const embeddedOn = typeof body?.embeddedOn === "string" ? body.embeddedOn : null;

  const supabase = createServiceClient();
  const resolved = await resolveCompanyAndAgent(supabase, companySlug, agentSlug, embeddedOn);
  if (resolved.error) return resolved.error;
  const { companyId, agentId } = resolved.target;

  const ip = getClientIp(request);
  try {
    const ipCheck = await checkAndRecordIpRateLimit(supabase, ip);
    if (!ipCheck.allowed) {
      return NextResponse.json({ error: ipCheck.reason }, { status: 429 });
    }
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to check rate limit" },
      { status: 500 },
    );
  }

  let session;
  try {
    session = await resolveWebChatSession(supabase, companyId, agentId, sessionId);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to resolve chat session" },
      { status: 500 },
    );
  }

  try {
    const conversationCheck = await checkConversationRateLimit(supabase, session.conversationId);
    if (!conversationCheck.allowed) {
      return NextResponse.json({ error: conversationCheck.reason }, { status: 429 });
    }
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to check rate limit" },
      { status: 500 },
    );
  }

  // The customer's own message is persisted before calling the Agent
  // Engine, never after -- if the engine call below fails, the customer's
  // message is never lost; a retry or refresh still shows it was received.
  const { error: customerMessageError } = await supabase
    .from("messages")
    .insert({ company_id: companyId, conversation_id: session.conversationId, role: "customer", content: message });
  if (customerMessageError) {
    return NextResponse.json({ error: customerMessageError.message }, { status: 500 });
  }

  // F5 / N9 -- a 'paused' conversation (set by Malu's own request_human tool,
  // or by a merchant sending a manual reply from the dashboard) means a human
  // is expected to handle this, not the AI. The customer's message above is
  // still persisted either way -- they're always heard -- but the engine is
  // never called while paused. The Instagram webhook applies the same gate
  // (N9); this is the shared shape both channels follow.
  const { data: conversation, error: conversationStatusError } = await supabase
    .from("conversations")
    .select("status")
    .eq("id", session.conversationId)
    .single();
  if (conversationStatusError) {
    return NextResponse.json({ error: conversationStatusError.message }, { status: 500 });
  }
  if (conversation.status === "paused") {
    return NextResponse.json({ reply: null });
  }

  let result;
  try {
    result = await AgentEngine.run({ companyId, conversationId: session.conversationId, message });
  } catch {
    // Never leak internal error detail to a public customer-facing API --
    // unlike dev-chat-test (a merchant debug tool), this is real production
    // traffic.
    return NextResponse.json({ error: "Failed to get a reply" }, { status: 502 });
  }

  await supabase
    .from("conversations")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", session.conversationId);

  const { data: reply, error: replyError } = await supabase
    .from("messages")
    .insert({
      company_id: companyId,
      conversation_id: session.conversationId,
      role: "agent",
      content: result.responseText,
    })
    .select("role, content, created_at")
    .single();
  if (replyError) return NextResponse.json({ error: replyError.message }, { status: 500 });

  return NextResponse.json({ reply });
}
