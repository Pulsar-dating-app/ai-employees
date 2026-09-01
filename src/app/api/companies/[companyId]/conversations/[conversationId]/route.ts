import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getConversationDetail } from "@/lib/conversations/detail";

// Trello F5 -- single-conversation detail (GET) and the one supported
// mutation, resuming the AI (PATCH { status: 'active' }). Sending a
// merchant reply lives in ./messages/route.ts, not here -- a reply and a
// status change are different write shapes, matching this codebase's
// existing split between a resource's own PATCH and its nested sub-resource
// routes elsewhere (e.g. companies/[id] vs. companies/[id]/members).
//
// The actual query/enrichment logic lives in getConversationDetail
// (src/lib/conversations/detail.ts), shared with this conversation's own
// detail page (conversations/[conversationId]/page.tsx) so the two can
// never return differently-shaped data for the same conversation.

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

export async function GET(
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

  const result = await getConversationDetail(supabase, companyId, conversationId);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json(result);
}

// PATCH { status: "active" } -- "Resume AI", handing control back after a
// merchant took over. No other transition is exposed: taking over happens
// implicitly by sending a reply (see ./messages/route.ts), and a manual
// "mark resolved" wasn't asked for -- a natural fast-follow, not invented
// here.
export async function PATCH(
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
  if (body?.status !== "active") {
    return NextResponse.json({ error: 'Only { status: "active" } is supported' }, { status: 400 });
  }

  const existing = await getConversationDetail(supabase, companyId, conversationId);
  if ("error" in existing) {
    return NextResponse.json({ error: existing.error }, { status: existing.status });
  }

  const { data, error } = await supabase
    .from("conversations")
    .update({ status: "active" })
    .eq("id", conversationId)
    .eq("company_id", companyId)
    .select("id, status")
    .single();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ conversation: data });
}
