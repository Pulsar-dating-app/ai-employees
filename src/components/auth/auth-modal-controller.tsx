"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
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
  const searchParams = useSearchParams();
  const router = useRouter();
  const tErrors = useTranslations("Auth.errors");
  const queryMode = searchParams.get("auth");
  const hasResetError = searchParams.get("reset_error") === "1";

  // Supabase's own /verify endpoint rejects an expired or already-used
  // recovery link (e.g. an email "safe links" scanner pre-fetching it)
  // *before* it ever reaches src/app/auth/callback/route.ts -- there's no
  // session yet to hand that route, so it redirects straight to the Site
  // URL instead, with `error`/`error_description` in the query and/or the
  // URL hash. Left unhandled that's a silent bounce to the bare landing page
  // with no explanation. Rewritten (via a navigation, not local state -- the
  // URL stays the single source of truth) into `?auth=forgot-password
  // &reset_error=1`, so the panel below can show a real message.
  useEffect(() => {
    const hashError = new URLSearchParams(window.location.hash.replace(/^#/, "")).get("error");
    const queryError = searchParams.get("error");
    if (!hashError && !queryError) return;

    const url = new URL(window.location.href);
    url.hash = "";
    ["error", "error_code", "error_description"].forEach((key) => url.searchParams.delete(key));
    url.searchParams.set("auth", "forgot-password");
    url.searchParams.set("reset_error", "1");
    router.replace(`${url.pathname}${url.search}`, { scroll: false });
  }, [searchParams, router]);

  if (!isMode(queryMode)) return null;

  return (
    <AuthOverlay key={queryMode} closeTo="/">
      {queryMode === "login" ? (
        <LoginPanel />
      ) : queryMode === "signup" ? (
        <SignUpPanel />
      ) : queryMode === "forgot-password" ? (
        <ForgotPasswordPanel initialError={hasResetError ? tErrors("resetLinkInvalid") : null} />
      ) : (
        <ResetPasswordPanel />
      )}
    </AuthOverlay>
  );
}
