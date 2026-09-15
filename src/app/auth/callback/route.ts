import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Supabase-specific auth callback -- distinct from the app's other OAuth
// callbacks (Shopify, Instagram, Google Calendar each have their own), since
// those are third-party integrations on an already-authenticated session
// and this is Supabase's own session-recovery redirect target. Currently
// only reached via the password-reset email link
// (requestPasswordReset in src/lib/auth/actions.ts sets redirectTo here).
//
// Deliberately no `?next=` on that redirectTo, even though this route
// accepts one -- Supabase's Redirect URLs allow-list match is exact,
// query string included, so a `redirectTo` carrying one won't match a
// plain `.../auth/callback` allow-list entry and Supabase silently falls
// back to the Site URL instead (still attaching a valid `?code=`, just on
// the wrong page -- see proxy.ts's handling of that). Defaulting `next` to
// "/reset-password" covers today's only real caller; a future flow that
// needs somewhere else can pass `?next=` as long as its own exact
// `redirectTo` (query string included) is separately allow-listed too.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next");
  // Only ever a same-origin path we generated ourselves, never
  // user-controlled -- still guarded against "//evil.com"-style
  // protocol-relative values before it's ever handed to NextResponse.redirect.
  const safeNext = next && next.startsWith("/") && !next.startsWith("//") ? next : "/reset-password";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${safeNext}`);
    }
  }

  return NextResponse.redirect(`${origin}/?auth=login`);
}
