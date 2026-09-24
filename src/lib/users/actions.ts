"use server";

import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";

// 2026-09-25 -- the "profile" onboarding step: every account needs a name
// (the owner is also their company's first professional, and a name is what
// the team and Ana's booking emails show). `users.name` is one of the columns
// a user may update on their own row (grant in 20260908110000).
export type ProfileState = { error: string | null };

const MAX_PERSON_NAME_LENGTH = 120;

export async function saveProfileName(_prev: ProfileState, formData: FormData): Promise<ProfileState> {
  const t = await getTranslations("Onboarding.profile");
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: t("nameMissing") };
  if (name.length > MAX_PERSON_NAME_LENGTH) return { error: t("nameTooLong", { max: MAX_PERSON_NAME_LENGTH }) };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { error } = await supabase.from("users").update({ name }).eq("id", user.id);
  if (error) {
    console.error("[onboarding] saving the user's name failed", { code: error.code, message: error.message });
    return { error: t("error") };
  }

  // The dashboard shell sends them on to wherever they actually are: the
  // company step for a new owner, the dashboard for everyone else.
  redirect("/dashboard");
}
