import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    // `c/` (Trello E1's checkout redirect), `api/chat/` (Trello M3's public
    // chat API), and `talk/` (Trello M4's standalone hosted chat page) are
    // excluded deliberately: all three are public, unauthenticated surfaces
    // a customer with no Sidde session calls directly, so running
    // updateSession's supabase.auth.getUser() round-trip on them would add
    // latency for nothing.
    "/((?!_next/static|_next/image|favicon.ico|c/|api/chat/|talk/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
