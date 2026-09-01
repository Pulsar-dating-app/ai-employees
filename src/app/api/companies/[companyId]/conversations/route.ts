import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { listConversations } from "@/lib/conversations/list";

// Trello F5 -- the merchant-facing "who's talking to my customers, and do
// any of them need me" list. Web chat only for now (channel = 'web_chat'
// hardcoded, inside listConversations): WhatsApp conversations have no
// local message history to preview here (they rely entirely on OpenAI's
// own Conversations API), and showing them would need a separate
// live-fetch code path -- a deliberately separate, larger piece of work,
// not bundled into this ticket.
//
// The actual query/enrichment logic lives in listConversations
// (src/lib/conversations/list.ts), shared with this page's own initial
// server-side render (conversations/page.tsx) so the two can never return
// differently-shaped rows for the same query.

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

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

function parsePositiveInt(value: string | null, fallback: number, max?: number): number {
  const parsed = value === null ? NaN : Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) return fallback;
  return max ? Math.min(parsed, max) : parsed;
}

const STATUS_FILTERS = ["paused", "active", "closed"] as const;

// GET ?status=all|paused|active|closed&search=&page=&pageSize=
export async function GET(request: Request, { params }: { params: Promise<{ companyId: string }> }) {
  const { companyId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const memberCheck = await requireMember(supabase, companyId, user.id);
  if (memberCheck.error) return memberCheck.error;

  const searchParams = new URL(request.url).searchParams;
  const statusParam = searchParams.get("status");
  const status = (STATUS_FILTERS as readonly string[]).includes(statusParam ?? "")
    ? (statusParam as "paused" | "active" | "closed")
    : null;
  const search = searchParams.get("search")?.trim() || null;
  const page = parsePositiveInt(searchParams.get("page"), 1);
  const pageSize = parsePositiveInt(searchParams.get("pageSize"), DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);

  const result = await listConversations(supabase, companyId, { status, search, page, pageSize });
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  return NextResponse.json({ conversations: result.rows, total: result.total, page, pageSize });
}
