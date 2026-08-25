"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// Supabase's raw error text isn't customer-facing copy — translate the ones
// users will actually hit, pass the rest through as-is.
function friendlyAuthError(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes("invalid login credentials")) {
    return "Incorrect email or password.";
  }
  if (lower.includes("email not confirmed")) {
    return "Please confirm your email before logging in.";
  }
  if (lower.includes("user already registered")) {
    return "An account with this email already exists.";
  }
  if (lower.includes("password should be at least")) {
    return "Password must be at least 6 characters.";
  }
  return message;
}

export async function login(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    redirect(`/login?error=${encodeURIComponent(friendlyAuthError(error.message))}`);
  }

  redirect("/dashboard");
}

export async function signUp(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({ email, password });

  if (error) {
    redirect(`/sign-up?error=${encodeURIComponent(friendlyAuthError(error.message))}`);
  }

  // No session back means the project requires email confirmation before login.
  if (!data.session) {
    redirect("/sign-up?checkEmail=1");
  }

  redirect("/dashboard");
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
