import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";
import { classifyUsage, isHardStopEnabled } from "./limits";

// Trello P7 -- the single pre-run decision every inbound channel makes
// before calling AgentEngine.run(), plus the one metering call it makes
// after a reply goes out. Web chat and the Instagram webhook both go
// through here so P4's lapsed-subscription block and P7's reply-quota soft
// cap can't drift apart.

const BILLING_ACTIVE_STATUSES = new Set(["active", "trialing"]);

// Sent to the customer only when the hard stop is armed AND this period is
// past the grace band -- an honest "we got it, a person will follow up"
// instead of an AI reply that would cost money the plan no longer covers.
//
// Like UNGROUNDED_FALLBACK_TEXT in the agent engine, this is a hard-coded
// Portuguese string: at this point no model turn runs to phrase it and
// nothing here detects the customer's language. Portuguese is the launch
// language (spec §19). If channel routing ever learns the locale, this is
// the seam to localise.
export const QUOTA_EXCEEDED_CUSTOMER_TEXT =
  "Recebemos a sua mensagem e já vamos te responder por aqui. Obrigado pela paciência! 😊";

export type ReplyGateDecision =
  | { allow: true; overPlan: boolean }
  | { allow: false; reason: "lapsed" | "grace_exceeded" };

type BillingFacts = {
  subscription_status: string;
  current_period_start: string | null;
} | null;

type UsageFacts = { replies_used: number; reply_limit: number } | null;

export type ReplyGateOptions = {
  /** Override env for tests. Defaults to {@link isHardStopEnabled}. */
  hardStopEnabled?: boolean;
  /** Passed straight to {@link classifyUsage}; defaults to the env grace multiplier. */
  graceMultiplier?: number;
};

/**
 * Pure decision: given the billing row, the current-period usage row, and
 * the config, what should the channel do?
 *
 *  - no billing row              -> allow (a pre-billing company; the "no
 *                                   plan at all" cut-over is P6, not here)
 *  - status not active/trialing  -> block `lapsed` (P4: card declined /
 *                                   unpaid / canceled / incomplete)
 *  - no usage row this period    -> allow (P4 hasn't provisioned it;
 *                                   record_ai_reply would no-op too --
 *                                   "never stop from nowhere")
 *  - used < limit                -> allow
 *  - limit <= used < limit*grace -> allow + `overPlan` (P5 banner escalates)
 *  - used >= limit*grace         -> block `grace_exceeded` if the hard stop
 *                                   is armed, else allow + `overPlan`
 */
export function decideReplyGate(
  billing: BillingFacts,
  usage: UsageFacts,
  options: ReplyGateOptions = {},
): ReplyGateDecision {
  if (!billing) return { allow: true, overPlan: false };
  if (!BILLING_ACTIVE_STATUSES.has(billing.subscription_status)) {
    return { allow: false, reason: "lapsed" };
  }
  if (!usage) return { allow: true, overPlan: false };

  const standing = classifyUsage(usage.replies_used, usage.reply_limit, options.graceMultiplier);
  if (standing === "within") return { allow: true, overPlan: false };
  if (standing === "over_plan") return { allow: true, overPlan: true };

  const hardStop = options.hardStopEnabled ?? isHardStopEnabled();
  return hardStop ? { allow: false, reason: "grace_exceeded" } : { allow: true, overPlan: true };
}

/**
 * Reads the billing + current-period usage rows for a company and returns
 * the pre-run decision. `client` defaults to the service-role client; pass
 * one in tests. `options` overrides the env-backed config.
 */
export async function evaluateReplyGate(
  companyId: string,
  client?: SupabaseClient,
  options: ReplyGateOptions = {},
): Promise<ReplyGateDecision> {
  const supabase = client ?? createServiceClient();

  const { data: billing } = await supabase
    .from("company_billing")
    .select("subscription_status, current_period_start")
    .eq("company_id", companyId)
    .maybeSingle();

  if (!billing) return { allow: true, overPlan: false };
  if (!BILLING_ACTIVE_STATUSES.has(billing.subscription_status as string)) {
    return { allow: false, reason: "lapsed" };
  }

  // The "current" usage row is the one whose period_start matches the
  // billing row's current_period_start (same join record_ai_reply makes).
  // A null current_period_start (an incomplete stub from the P3 checkout
  // route) can't match anything -- and that status is already blocked above.
  const { data: usage } = await supabase
    .from("company_message_usage")
    .select("replies_used, reply_limit")
    .eq("company_id", companyId)
    .eq("period_start", billing.current_period_start as string)
    .maybeSingle();

  return decideReplyGate(
    {
      subscription_status: billing.subscription_status as string,
      current_period_start: billing.current_period_start as string | null,
    },
    usage
      ? { replies_used: usage.replies_used as number, reply_limit: usage.reply_limit as number }
      : null,
    options,
  );
}

/**
 * Counts one AI reply against the company's monthly pool. The
 * `record_ai_reply` RPC is the *only* writer of `replies_used`; it no-ops
 * (returns zero rows) when P4 hasn't provisioned a usage row for the
 * period. Best-effort: a metering failure is logged, never thrown -- the
 * customer already has the reply, and losing a count must not turn into a
 * failed response.
 */
export async function recordAiReply(companyId: string, client?: SupabaseClient): Promise<void> {
  const supabase = client ?? createServiceClient();
  const { error } = await supabase.rpc("record_ai_reply", { p_company_id: companyId });
  if (error) {
    console.error("[billing] record_ai_reply failed", { companyId, error: error.message });
  }
}
