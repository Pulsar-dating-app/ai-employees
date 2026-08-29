import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { AgentEngine } from "@/lib/agent-engine";

// TODO(C1-TEST-ONLY): delete this file (and dev-chat-test.tsx's button/panel
// in the agent detail page) once D2 (real WhatsApp inbound webhook) ships
// and there's a real caller of AgentEngine.run() to test against instead.
//
// TEMPORARY DEV-ONLY ROUTE -- Trello C1.
//
// Lets a merchant manually exercise the real Agent Engine (real OpenAI call,
// real ProductRepository-backed tools) from the dashboard, without a real
// WhatsApp connection. Reuses a single synthetic "Dev Chat Test" customer per
// company (channel: "whatsapp", the only enum value that exists -- not worth
// an ALTER TYPE for throwaway test tooling).
//
// Conversation rotation (prototype of what D2/D3 will formally own -- see
// decisions.md): no OpenAI conversation carries history forever (confirmed
// against OpenAI's own docs -- Conversation objects have no TTL, unlike bare
// Response objects), and D2's own card already specifies "reuse an existing
// open conversation." Left unbounded, that grows context/cost forever and
// never lets a customer's conversation reset. So: reuse the most recent
// *active* conversation for this customer+agent only if it was updated
// within the last 24h (WhatsApp's own customer-service session window --
// not an arbitrary number); otherwise close it (`status = 'closed'`) and
// start a fresh one. `conversations.updated_at` is touched after every turn
// (not just "on open a chat", since there's no such discrete event on an
// inbound-message-driven channel) so the next message's staleness check has
// an accurate timestamp -- this is exactly the "persist updated_at after the
// turn" work D3's card already names, just implemented here first.

if (process.env.NODE_ENV === "production") {
  throw new Error("dev-chat-test is a dev-only route and must not run in production");
}

const DEV_TEST_CUSTOMER_NAME = "Dev Chat Test";
const CONVERSATION_TTL_MS = 24 * 60 * 60 * 1000;

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

  if (error) return { error: NextResponse.json({ error: error.message }, { status: 500 }) };
  if (!membership) {
    return { error: NextResponse.json({ error: "Not a member of this company" }, { status: 403 }) };
  }
  return { error: null };
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

  const memberCheck = await requireMember(supabase, companyId, user.id);
  if (memberCheck.error) return memberCheck.error;

  const body = await request.json().catch(() => null);
  const message = typeof body?.message === "string" ? body.message.trim() : "";
  if (!message) {
    return NextResponse.json({ error: "message is required" }, { status: 400 });
  }

  const { data: agent, error: agentError } = await supabase
    .from("agents")
    .select("id")
    .eq("slug", agentSlug)
    .eq("is_active", true)
    .maybeSingle();
  if (agentError) return NextResponse.json({ error: agentError.message }, { status: 500 });
  if (!agent) return NextResponse.json({ error: "Agent not found" }, { status: 404 });

  const { data: companyAgent, error: companyAgentError } = await supabase
    .from("company_agents")
    .select("id")
    .eq("company_id", companyId)
    .eq("agent_id", agent.id)
    .maybeSingle();
  if (companyAgentError) {
    return NextResponse.json({ error: companyAgentError.message }, { status: 500 });
  }
  if (!companyAgent) {
    return NextResponse.json({ error: "This company hasn't hired this agent" }, { status: 400 });
  }

  // Reuse the same synthetic customer/conversation across messages so the
  // Agent Engine's conversation history (open_ai_conversation_id) actually
  // carries context between turns in the chat panel.
  const { data: existingCustomer, error: customerError } = await supabase
    .from("customers")
    .select("id")
    .eq("company_id", companyId)
    .eq("name", DEV_TEST_CUSTOMER_NAME)
    .maybeSingle();
  if (customerError) return NextResponse.json({ error: customerError.message }, { status: 500 });

  let customer = existingCustomer;

  if (!customer) {
    const { data: newCustomer, error: createCustomerError } = await supabase
      .from("customers")
      .insert({ company_id: companyId, name: DEV_TEST_CUSTOMER_NAME, channel: "whatsapp" })
      .select("id")
      .single();
    if (createCustomerError) {
      return NextResponse.json({ error: createCustomerError.message }, { status: 500 });
    }
    customer = newCustomer;
  }

  // Most recent *active* conversation for this customer+agent -- filtering
  // status="active" (not just company/customer/agent) means a closed one
  // from a past rotation is never picked back up.
  const { data: activeConversations, error: conversationError } = await supabase
    .from("conversations")
    .select("id, updated_at")
    .eq("company_id", companyId)
    .eq("customer_id", customer.id)
    .eq("agent_id", agent.id)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1);
  if (conversationError) {
    return NextResponse.json({ error: conversationError.message }, { status: 500 });
  }

  let conversation: { id: string; updated_at: string } | null = activeConversations?.[0] ?? null;

  if (conversation) {
    const age = Date.now() - new Date(conversation.updated_at).getTime();
    if (age > CONVERSATION_TTL_MS) {
      // Stale -- close it rather than reusing. Its open_ai_conversation_id
      // and history stay retrievable (F5's future transcript view), just
      // never fed into a new turn again.
      const { error: closeError } = await supabase
        .from("conversations")
        .update({ status: "closed" })
        .eq("id", conversation.id);
      if (closeError) return NextResponse.json({ error: closeError.message }, { status: 500 });
      conversation = null;
    }
  }

  if (!conversation) {
    const { data: newConversation, error: createConversationError } = await supabase
      .from("conversations")
      .insert({
        company_id: companyId,
        agent_id: agent.id,
        customer_id: customer.id,
        channel: "whatsapp",
        status: "active",
      })
      .select("id, updated_at")
      .single();
    if (createConversationError) {
      return NextResponse.json({ error: createConversationError.message }, { status: 500 });
    }
    conversation = newConversation;
  }

  try {
    const result = await AgentEngine.run({ companyId, conversationId: conversation.id, message });

    // Bump updated_at so the *next* message's staleness check above has an
    // accurate "last activity" timestamp -- the set_updated_at trigger
    // stamps this on any UPDATE regardless of the value written here.
    await supabase.from("conversations").update({ updated_at: new Date().toISOString() }).eq("id", conversation.id);

    // `grounding` (Trello C7) is echoed back so the dev panel can show when
    // the step-10 check regenerated or blocked a reply -- otherwise a
    // successful block is invisible while hand-testing, and looks like Malu
    // just decided to be vague.
    return NextResponse.json({ responseText: result.responseText, grounding: result.grounding });
  } catch (err) {
    return NextResponse.json(
      { error: "Agent Engine failed", detail: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    );
  }
}
