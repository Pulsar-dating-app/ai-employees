import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Supabase-specific auth callback -- distinct from the app's other OAuth
// callbacks (Shopify, Instagram, Google Calendar each have their own), since
// those are third-party integrations on an already-authenticated session
// and this is Supabase's own session-recovery redirect target. Currently
// only reached via the password-reset email link
// (requestPasswordReset in src/lib/auth/actions.ts sets redirectTo here),
// but written generically -- any future Supabase magic-link/OTP flow can
// reuse it the same way.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next");
  // Only ever a same-origin path we generated ourselves (e.g. "/reset-password"),
  // never user-controlled -- still guarded against "//evil.com"-style
  // protocol-relative values before it's ever handed to NextResponse.redirect.
  const safeNext = next && next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${safeNext}`);
    }
  }

  return NextResponse.redirect(`${origin}/?auth=login`);
}
