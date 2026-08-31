import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buildAuthorizeUrl } from "@/lib/instagram/meta-instagram-api";
import { OAUTH_STATE_COOKIE, encodeState, generateNonce } from "@/lib/instagram/oauth-state";

// Trello N3 -- the merchant-facing entry point into Business Login for
// Instagram: a plain <a href> on the connect card points straight here, no
// client-side JS needed to build the authorize URL or handle a token (this
// is a real page redirect, unlike WhatsApp's Embedded Signup or Google
// Calendar's popup code client -- see decisions.md).
//
// GET, not POST: it has to be navigable by a plain link/full-page
// navigation, which only ever sends GET. Admin-gated all the same --
// starting a connect flow that could end up overwriting the company's
// Instagram connection is not something a read-only member should trigger.
export async function GET(
  _request: Request,
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

  const { data: membership, error: membershipError } = await supabase
    .from("company_users")
    .select("role")
    .eq("company_id", companyId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (membershipError) {
    return NextResponse.json({ error: membershipError.message }, { status: 500 });
  }
  if (!membership || !["owner", "admin"].includes(membership.role)) {
    return NextResponse.json(
      { error: "Only company owners/admins can manage the Instagram connection" },
      { status: 403 },
    );
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

  const nonce = generateNonce();
  const state = encodeState({ companyId, agentSlug, nonce });

  const response = NextResponse.redirect(buildAuthorizeUrl(state), { status: 302 });

  // sameSite: "lax" (not "strict") is load-bearing -- the browser lands back
  // here via a top-level GET navigation FROM instagram.com, which is a
  // cross-site request. A "strict" cookie would simply not be sent on that
  // navigation, and the callback's nonce check would fail for every real
  // user, indistinguishably from an actual CSRF attempt.
  response.cookies.set(OAUTH_STATE_COOKIE, nonce, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });

  return response;
}
