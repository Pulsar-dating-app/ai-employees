"use server";

import { randomUUID } from "node:crypto";
import { after } from "next/server";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { absoluteUrl } from "@/lib/seo/site";
import { parseQuizAnswers } from "@/lib/quiz/answers";
import { META_REGISTRATION_COOKIE, META_REGISTRATION_COOKIE_MAX_AGE } from "@/lib/meta/pixel";
import { clientIpFrom } from "@/lib/meta/capi-event";
import { sendCapiEvent } from "@/lib/meta/conversions";

// Shape returned to `useActionState` in the auth forms — errors and the
// sign-up "confirm your email" state render inline (in a modal or a full
// page) with no redirect. Success still redirects to /dashboard.
export type AuthState = { error: string | null; checkEmail?: boolean };

// Supabase's raw error text isn't customer-facing copy — translate the ones
// users will actually hit, pass the rest through as-is (untranslated — these
// are unexpected/rare enough that they're not worth a message key each).
async function friendlyAuthError(message: string): Promise<string> {
  const t = await getTranslations("Auth.errors");
  const lower = message.toLowerCase();
  if (lower.includes("invalid login credentials")) {
    return t("invalidCredentials");
  }
  if (lower.includes("email not confirmed")) {
    return t("emailNotConfirmed");
  }
  if (lower.includes("user already registered")) {
    return t("userExists");
  }
  if (lower.includes("password should be at least")) {
    return t("passwordTooShort");
  }
  if (lower.includes("session") || lower.includes("expired") || lower.includes("invalid or has expired")) {
    return t("resetLinkInvalid");
  }
  return message;
}

export async function login(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return { error: await friendlyAuthError(error.message) };
  }

  redirect("/dashboard");
}

export async function signUp(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const quiz = parseQuizAnswers(formData.get("quiz"));

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    ...(quiz ? { options: { data: { quiz } } } : {}),
  });

  if (error) {
    return { error: await friendlyAuthError(error.message) };
  }

  // With confirmations on, an already-registered email comes back as a user
  // with no identities instead of an error -- not a new registration.
  const isNewAccount = (data.user?.identities?.length ?? 0) > 0;
  if (quiz && isNewAccount) await recordAdRegistration(email);

  // No session back means the project requires email confirmation before login.
  if (!data.session) {
    return { error: null, checkEmail: true };
  }

  redirect("/dashboard");
}

// A sign-up from the ad quiz is the conversion the Meta campaign optimises
// for. The browser pixel fires it from the cookie set here; the Conversions
// API sends the same event (same id, so Meta keeps one) after the response,
// for browsers where the pixel never runs.
async function recordAdRegistration(email: string) {
  const [cookieStore, headerStore] = await Promise.all([cookies(), headers()]);
  const eventId = randomUUID();
  cookieStore.set(META_REGISTRATION_COOKIE, eventId, {
    path: "/",
    maxAge: META_REGISTRATION_COOKIE_MAX_AGE,
    sameSite: "lax",
  });

  const event = {
    eventName: "CompleteRegistration",
    eventId,
    eventTime: new Date(),
    sourceUrl: headerStore.get("referer"),
    email,
    fbp: cookieStore.get("_fbp")?.value ?? null,
    fbc: cookieStore.get("_fbc")?.value ?? null,
    clientIp: clientIpFrom(headerStore.get("x-forwarded-for")),
    userAgent: headerStore.get("user-agent"),
  };
  after(() => sendCapiEvent(event));
}

export async function requestPasswordReset(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim();

  const supabase = await createClient();
  // No `?next=` here -- see src/app/auth/callback/route.ts's doc comment:
  // Supabase's Redirect URLs allow-list match is exact (query string
  // included), so this must be byte-identical to the allow-listed entry.
  // The callback route defaults to /reset-password on its own.
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: absoluteUrl("/auth/callback"),
  });

  if (error) {
    return { error: await friendlyAuthError(error.message) };
  }

  // Supabase never reveals whether the email exists -- always show the same
  // "check your email" state, mirroring signUp's identical no-enumeration shape.
  return { error: null, checkEmail: true };
}

export async function resetPassword(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const password = String(formData.get("password") ?? "");

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });

  if (error) {
    return { error: await friendlyAuthError(error.message) };
  }

  redirect("/dashboard");
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
