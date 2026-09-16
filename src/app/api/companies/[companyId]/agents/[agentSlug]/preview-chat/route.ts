import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { AgentEngine } from "@/lib/agent-engine";
import { resolveRehearsalToolsForAgent } from "@/lib/agent-engine/tools/rehearsal";
import { evaluateReplyGate, recordAiReply } from "@/lib/billing/enforcement";

// The first session's proof step. Deliberately NOT the public chat route:
// that one is unauthenticated by design, so a "this is only a rehearsal" flag
// on it would be forgeable by anyone and hand out an agent that never records
// anything. Here the merchant's own session is the authority, and the
// rehearsal tool set is chosen server-side where no caller can influence it.
//
// What is real: the agent, her prompt, her reads, the grounding check, the
// billing gate and the free-reply meter. What is not: every write she makes
// (see tools/rehearsal.ts) and the conversation's presence in the inbox or
// the numbers (conversations.is_preview).

const MAX_MESSAGE_LENGTH = 2000;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ companyId: string; agentSlug: string }> },
) {
  const { companyId, agentSlug } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { data: membership } = await supabase
    .from("company_users")
    .select("role")
    .eq("company_id", companyId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!membership) {
    return NextResponse.json({ error: "Not a member of this company" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const message = typeof body?.message === "string" ? body.message.trim() : "";
  if (!message) return NextResponse.json({ error: "message is required" }, { status: 400 });
  if (message.length > MAX_MESSAGE_LENGTH) {
    return NextResponse.json({ error: "message is too long" }, { status: 400 });
  }

  const service = createServiceClient();

  const { data: agent } = await service
    .from("agents")
    .select("id")
    .eq("slug", agentSlug)
    .eq("is_active", true)
    .maybeSingle();
  if (!agent) return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  const agentId = (agent as { id: string }).id;

  const { data: hire } = await service
    .from("company_agents")
    .select("id")
    .eq("company_id", companyId)
    .eq("agent_id", agentId)
    .maybeSingle();
  if (!hire) {
    return NextResponse.json({ error: "This company hasn't hired this agent" }, { status: 400 });
  }

  // Same meter every channel uses. The rehearsal is exactly what the pre-plan
  // allowance is for, so it counts against it -- otherwise the cap that closes
  // the "never finish onboarding" hole would have a hole of its own.
  const gate = await evaluateReplyGate(companyId, service);
  if (!gate.allow) {
    return NextResponse.json({ reply: null, blocked: gate.reason }, { status: 200 });
  }

  const conversationId = await resolvePreviewConversation(service, companyId, agentId);
  if (!conversationId) {
    return NextResponse.json({ error: "Could not start the preview" }, { status: 500 });
  }

  let result;
  try {
    result = await AgentEngine.run(
      { companyId, conversationId, message },
      { supabase: service, tools: resolveRehearsalToolsForAgent(agentSlug) },
    );
  } catch (error) {
    console.error("[preview-chat] agent run failed", { companyId, agentSlug, error });
    return NextResponse.json({ error: "The preview could not reply" }, { status: 502 });
  }

  await recordAiReply(companyId, service);

  // The proof has happened. Stamped here rather than on page load, because
  // opening the step is not seeing her work -- getting an answer is. Only the
  // first one matters, so a later reply leaves it alone.
  const { error: proofError } = await service
    .from("companies")
    .update({ proof_seen_at: new Date().toISOString() })
    .eq("id", companyId)
    .is("proof_seen_at", null);
  if (proofError) {
    console.error("[preview-chat] could not record the proof", { companyId, error: proofError });
  }

  return NextResponse.json({ reply: { content: result.responseText } });
}

// One preview conversation per hire, reused: the merchant coming back to try
// again continues where they left off rather than accumulating throwaway
// threads, and there is exactly one row per hire for the inbox to hide.
async function resolvePreviewConversation(
  service: ReturnType<typeof createServiceClient>,
  companyId: string,
  agentId: string,
): Promise<string | null> {
  const { data: existing } = await service
    .from("conversations")
    .select("id")
    .eq("company_id", companyId)
    .eq("agent_id", agentId)
    .eq("is_preview", true)
    .maybeSingle();
  if (existing) return (existing as { id: string }).id;

  const { data: customer, error: customerError } = await service
    .from("customers")
    .insert({ company_id: companyId, channel: "web_chat", name: "Preview" })
    .select("id")
    .single();
  if (customerError) {
    console.error("[preview-chat] could not create the preview customer", customerError);
    return null;
  }

  const { data: conversation, error: conversationError } = await service
    .from("conversations")
    .insert({
      company_id: companyId,
      agent_id: agentId,
      customer_id: (customer as { id: string }).id,
      channel: "web_chat",
      status: "active",
      is_preview: true,
    })
    .select("id")
    .single();
  if (conversationError) {
    console.error("[preview-chat] could not create the preview conversation", conversationError);
    return null;
  }

  return (conversation as { id: string }).id;
}
