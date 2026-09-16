"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

// The merchant leaving the last step is what ends the first session -- not
// reaching it. Arriving at the proof step and closing the tab leaves the flow
// open, so they get the moment they never saw when they come back.
export async function finishOnboarding() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Read with the caller's own client: RLS scopes this to a company they
  // actually belong to, and that read IS the authorization for the write
  // below. Never take a company id from the request.
  const { data: companies } = await supabase
    .from("companies")
    .select("id, onboarding_completed_at")
    .limit(1);
  const company = companies?.[0] as { id: string; onboarding_completed_at: string | null } | undefined;

  if (company && !company.onboarding_completed_at) {
    // `onboarding_completed_at` is column-privilege-locked against
    // authenticated/anon (migration 20260916140000) precisely so a merchant
    // cannot reopen their own free window, which means the caller's client is
    // not allowed to write it either -- this is the service-role path that
    // migration always implied.
    const { error } = await createServiceClient()
      .from("companies")
      .update({ onboarding_completed_at: new Date().toISOString() })
      .eq("id", company.id);

    // Not best-effort any more: a swallowed failure here leaves the merchant
    // bouncing between the dashboard and a flow they already finished.
    if (error) {
      console.error("Failed to mark onboarding complete", { companyId: company.id, error });
      throw new Error("Could not finish onboarding");
    }

    await pauseHiresWithoutAPlan(company.id);
  }

  redirect("/dashboard");
}

// Leaving the first session without a plan parks the hire, rather than
// leaving a row that says "Active" next to an employee the reply gate will
// silence anyway. The gate is still the thing that protects revenue -- this
// is what makes the dashboard tell the truth about it, and it stops the
// hosted chat link from even reaching the agent (the chat routes check
// `status === "active"` before billing is consulted).
//
// The Stripe webhook un-pauses these on the company's first activation, so
// nobody who just paid has to hunt for a toggle.
async function pauseHiresWithoutAPlan(companyId: string) {
  const service = createServiceClient();

  const { data: billing } = await service
    .from("company_billing")
    .select("subscription_status")
    .eq("company_id", companyId)
    .maybeSingle();

  const status = (billing as { subscription_status: string } | null)?.subscription_status;
  if (status === "active" || status === "trialing") return;

  const { error } = await service
    .from("company_agents")
    .update({ status: "paused" })
    .eq("company_id", companyId)
    .eq("status", "active");

  if (error) {
    // Not fatal to finishing: the reply gate still blocks every channel, so
    // the worst case is a dashboard that overstates the hire until they pay.
    console.error("Failed to pause hires after onboarding", { companyId, error });
  }
}
