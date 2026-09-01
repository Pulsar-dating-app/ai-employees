import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Trello F5 -- a merchant's manual reply. Sending one *is* taking over:
// this always flips the conversation to 'paused' (unless already there),
// no separate "take over" step. The AI stays off (src/app/api/chat/...
// checks this same status) until "Resume AI" (the sibling route's PATCH)
// hands control back.

const MAX_MESSAGE_LENGTH = 4000;

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
    return { error: NextResponse.json({ error: error.message }, { status: 500 }) };
  }
  if (!membership) {
    return { error: NextResponse.json({ error: "Not a member of this company" }, { status: 403 }) };
  }
  return { error: null };
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ companyId: string; conversationId: string }> },
) {
  const { companyId, conversationId } = await params;
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
  if (message.length > MAX_MESSAGE_LENGTH) {
    return NextResponse.json({ error: `message must be ${MAX_MESSAGE_LENGTH} characters or fewer` }, { status: 400 });
  }

  const { data: conversation, error: conversationError } = await supabase
    .from("conversations")
    .select("id, status")
    .eq("id", conversationId)
    .eq("company_id", companyId)
    .eq("channel", "web_chat")
    .maybeSingle();
  if (conversationError) {
    return NextResponse.json({ error: conversationError.message }, { status: 500 });
  }
  if (!conversation) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { data: reply, error: replyError } = await supabase
    .from("messages")
    .insert({ company_id: companyId, conversation_id: conversationId, role: "merchant", content: message })
    .select("role, content, created_at")
    .single();
  if (replyError) {
    return NextResponse.json({ error: replyError.message }, { status: 500 });
  }

  if (conversation.status !== "paused") {
    const { error: pauseError } = await supabase
      .from("conversations")
      .update({ status: "paused" })
      .eq("id", conversationId);
    if (pauseError) {
      return NextResponse.json({ error: pauseError.message }, { status: 500 });
    }
  } else {
    // Already paused -- still bump updated_at so this conversation sorts to
    // the top of the list, same as every other message-sent path.
    await supabase.from("conversations").update({ updated_at: new Date().toISOString() }).eq("id", conversationId);
  }

  return NextResponse.json({ message: reply }, { status: 201 });
}
