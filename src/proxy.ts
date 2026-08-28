import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    // `c/` (Trello E1's checkout redirect) is excluded deliberately: it's a
    // public link a customer taps mid-purchase, with no session to refresh,
    // so running updateSession's supabase.auth.getUser() round-trip on it
    // would add latency to every click for nothing.
    "/((?!_next/static|_next/image|favicon.ico|c/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
