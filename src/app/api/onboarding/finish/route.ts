import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { completeOnboarding } from "@/lib/companies/complete-onboarding";

// The way out of the first session: a plain form POST, answered with a 303
// so the browser makes an ordinary GET of the destination. See
// complete-onboarding.ts for why this isn't a server action.
export async function POST(request: Request) {
  // Same-origin forms only. The session cookies are SameSite=Lax, so a
  // cross-site POST wouldn't carry them anyway; this makes it explicit.
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const form = await request.formData().catch(() => null);
  const target = await completeOnboarding(await createClient(), form?.get("next"));
  return NextResponse.redirect(new URL(target ?? "/login", request.url), 303);
}
