"use client";

import { useSearchParams } from "next/navigation";
import { AuthOverlay } from "./auth-overlay";
import { LoginPanel } from "./login-panel";
import { SignUpPanel } from "./sign-up-panel";
import { ForgotPasswordPanel } from "./forgot-password-panel";
import { ResetPasswordPanel } from "./reset-password-panel";

const MODES = ["login", "signup", "forgot-password", "reset-password"] as const;
type Mode = (typeof MODES)[number];

function isMode(value: string | null): value is Mode {
  return !!value && (MODES as readonly string[]).includes(value);
}

// Drives the auth overlay from the `?auth=` query param on the landing.
// `/login`, `/sign-up`, `/forgot-password` and `/reset-password` redirect
// here, so deep links (and the emailed password-reset link, via
// src/app/auth/callback/route.ts) still work — they just resolve to the
// landing with the overlay open.
export function AuthModalController() {
  const mode = useSearchParams().get("auth");
  if (!isMode(mode)) return null;

  return (
    <AuthOverlay key={mode} closeTo="/">
      {mode === "login" ? (
        <LoginPanel />
      ) : mode === "signup" ? (
        <SignUpPanel />
      ) : mode === "forgot-password" ? (
        <ForgotPasswordPanel />
      ) : (
        <ResetPasswordPanel />
      )}
    </AuthOverlay>
  );
}
