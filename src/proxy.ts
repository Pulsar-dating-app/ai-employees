import { type NextRequest, NextResponse } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function proxy(request: NextRequest) {
  // Safety net for a Supabase auth email whose `redirectTo` doesn't
  // exactly match the Redirect URLs allow-list (query string included) --
  // Supabase falls back to the Site URL but still attaches a valid `?code=`,
  // which would otherwise just sit inert on the bare landing page. Forward
  // it to the real handler instead of losing an already-valid code.
  // See src/app/auth/callback/route.ts's doc comment for the full story.
  const { pathname, searchParams } = request.nextUrl;
  if (pathname === "/" && searchParams.has("code")) {
    const url = request.nextUrl.clone();
    url.pathname = "/auth/callback";
    return NextResponse.redirect(url);
  }

  return await updateSession(request);
}

export const config = {
  matcher: [
    // `c/` (Trello E1's checkout redirect), `api/chat/` (Trello M3's public
    // chat API), `api/sales-contact` (the landing page's "Talk to a
    // specialist" form), `talk/` (Trello M4's standalone hosted chat page),
    // `api/webhooks/` (Trello N4's Instagram inbound webhook) and
    // `api/cron/` (Trello N6's token-refresh job) are excluded
    // deliberately: all are public, unauthenticated surfaces called
    // directly by a customer, by Meta, or by a scheduler with no Staffra
    // session, so running updateSession's supabase.auth.getUser()
    // round-trip on them would add latency for nothing -- there is no
    // cookie to refresh in the first place. `api/cron/` is guarded by a
    // bearer CRON_SECRET inside the route, not by a session.
    "/((?!_next/static|_next/image|favicon.ico|c/|api/chat/|api/sales-contact|talk/|api/webhooks/|api/cron/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
