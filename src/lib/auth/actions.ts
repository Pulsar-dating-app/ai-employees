"use server";

import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";

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

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({ email, password });

  if (error) {
    return { error: await friendlyAuthError(error.message) };
  }

  // No session back means the project requires email confirmation before login.
  if (!data.session) {
    return { error: null, checkEmail: true };
  }

  redirect("/dashboard");
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
