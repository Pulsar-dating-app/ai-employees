import { redirect } from "next/navigation";

// Same pattern as /login and /sign-up: not a real page, just a stable,
// linkable URL that resolves to the landing with the auth overlay open.
// src/app/auth/callback/route.ts redirects here once the recovery code from
// the emailed reset link has been exchanged for a real session.
export default function ResetPasswordPage() {
  redirect("/?auth=reset-password");
}
