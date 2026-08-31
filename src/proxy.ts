import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    // `c/` (Trello E1's checkout redirect), `api/chat/` (Trello M3's public
    // chat API), `talk/` (Trello M4's standalone hosted chat page), and
    // `api/webhooks/` (Trello N4's Instagram inbound webhook) are excluded
    // deliberately: all four are public, unauthenticated surfaces called
    // directly by a customer or by Meta itself with no Staffra session, so
    // running updateSession's supabase.auth.getUser() round-trip on them
    // would add latency for nothing -- Meta's webhook caller has no cookie
    // to refresh in the first place.
    "/((?!_next/static|_next/image|favicon.ico|c/|api/chat/|talk/|api/webhooks/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
