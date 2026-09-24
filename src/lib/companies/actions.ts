"use server";

import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { claimPendingInvite } from "@/lib/team/invites";

// Onboarding: the one place a company is created in the UI. The hire flow
// and Settings used to each create one inline; now they can assume it
// exists (the dashboard shell redirects a company-less account here first).
// Mirrors src/lib/auth/actions.ts — a `useActionState` shape, inline error,
// redirect on success.
export type OnboardingState = { error: string | null };

export async function createCompany(
  _prev: OnboardingState,
  formData: FormData,
): Promise<OnboardingState> {
  const t = await getTranslations("Onboarding");
  const name = String(formData.get("name") ?? "").trim();
  if (!name) {
    return { error: t("nameMissing") };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // A stale tab or double-submit shouldn't mint a second company.
  const { data: existing } = await supabase.from("companies").select("id").limit(1);
  if (existing && existing.length > 0) redirect("/onboarding/hire");

  // An address a company added as a professional joins that company instead
  // of creating one (one company per account).
  if (await claimPendingInvite(user)) redirect("/dashboard");

  // Same atomic RPC the POST /api/companies route uses — companies insert +
  // company_users(owner) insert in one call, and (since 2026-09-25) the
  // seeded professional linked to the owner.
  const { data: company, error } = await supabase.rpc("create_company_with_owner", {
    company_name: name,
    company_email: null,
    company_phone: null,
    company_website_url: null,
    company_description: null,
    company_currency: null,
    company_country: null,
    company_timezone: null,
  });

  if (error) {
    console.error("create_company_with_owner failed (onboarding)", {
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
    });
    return { error: t("error") };
  }

  // The seeded professional is named after the company; the owner is that
  // professional in a solo business, so it takes their name. Best-effort --
  // it's renamable from the Professionals tab.
  const { data: me } = await supabase.from("users").select("name").eq("id", user.id).maybeSingle();
  const ownerName = ((me?.name as string | null | undefined) ?? "").trim();
  const companyId = (company as { id?: string } | null)?.id;
  if (ownerName && companyId) {
    const { error: renameError } = await createServiceClient()
      .from("professionals")
      .update({ name: ownerName.slice(0, 120) })
      .eq("company_id", companyId)
      .eq("user_id", user.id);
    if (renameError) console.error("[onboarding] renaming the owner's professional failed", renameError.message);
  }

  redirect("/onboarding/hire");
}
