"use client";

import { useSearchParams } from "next/navigation";
import { AuthOverlay } from "./auth-overlay";
import { LoginPanel } from "./login-panel";
import { SignUpPanel } from "./sign-up-panel";

// Drives the auth overlay from the `?auth=` query param on the landing.
// `/login` and `/sign-up` redirect here, so deep links still work — they
// just resolve to the landing with the overlay open.
export function AuthModalController() {
  const mode = useSearchParams().get("auth");
  if (mode !== "login" && mode !== "signup") return null;

  return (
    <AuthOverlay key={mode} closeTo="/">
      {mode === "login" ? <LoginPanel /> : <SignUpPanel />}
    </AuthOverlay>
  );
}
