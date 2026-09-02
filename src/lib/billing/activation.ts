import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";

// Trello P3 (stub) -- the single source of truth for "is this company's
// billing in good enough standing to run a bot". A paid plan is mandatory
// (no free tier, no trial): a company can only move a hire to `active` while
// `company_billing.subscription_status` is one of these.
//
// This helper is created here but NOT yet wired as an actual block. P6 is
// where it gates the hire route (POST) and the K6 activate PATCH
// (`status: 'active'`) on `company_agents`. Until then nothing calls it in
// production -- keeping the "what counts as active billing" decision in one
// place so P6 only has to add the call sites.
const BILLING_ACTIVE_STATUSES = new Set(["active", "trialing"]);

export async function isBillingActive(
  companyId: string,
  client?: SupabaseClient,
): Promise<boolean> {
  const supabase = client ?? createServiceClient();
  const { data } = await supabase
    .from("company_billing")
    .select("subscription_status")
    .eq("company_id", companyId)
    .maybeSingle();

  return data ? BILLING_ACTIVE_STATUSES.has(data.subscription_status as string) : false;
}
