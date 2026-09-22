import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";
import { endTrialNow } from "@/lib/stripe/billing";
import { classifyUsage, getFreeReplyAllowance, isHardStopEnabled } from "./limits";

// Trello P7 -- the single pre-run decision every inbound channel makes
// before calling AgentEngine.run(), plus the one metering call it makes
// after a reply goes out. Web chat and the Instagram webhook both go
// through here so P4's lapsed-subscription block and P7's reply-quota soft
// cap can't drift apart.

const BILLING_ACTIVE_STATUSES = new Set(["active", "trialing"]);

// A blocked reply gate (either reason below) is fully silent -- no canned
// customer-facing line. One was tried for `grace_exceeded` and dropped
// (2026-09-04): the only string available would have to be hard-coded in
// one language with no locale detection (same limitation as
// UNGROUNDED_FALLBACK_TEXT in the agent engine), so a customer writing in
// any other language would get a reply in the wrong one out of nowhere --
// worse than silence. Silence also keeps `lapsed` and `grace_exceeded`
// handled identically at every call site: `!allow` always means "persist
// the inbound message (already done upstream), send nothing back, let the
// merchant's dashboard alert be what surfaces it."

export type ReplyGateDecision =
  | { allow: true; overPlan: boolean }
  | { allow: false; reason: "lapsed" | "grace_exceeded" | "no_plan" };

// A company with no company_billing row at all. It used to be allowed
// outright ("the no-plan-at-all cut-over is P6, not here"), because hiring was
// gated on a plan and so a plan-less company could never have a hire to reply
// with. The first session now lets a merchant hire and try her out before
// paying, which moves that cut-over here: free while they are still in the
// flow and inside the allowance, blocked after.
export type PreBillingFacts = {
  onboardingCompletedAt: string | null;
  freeRepliesUsed: number;
} | null;

type BillingFacts = {
  subscription_status: string;
  current_period_start: string | null;
} | null;

type UsageFacts = { replies_used: number; reply_limit: number } | null;

// Two independent stops, and both have to hold. The onboarding flag alone
// would let anyone who simply never presses "finish" answer customers forever
// -- the /talk link works from the moment they hire. The allowance alone would
// keep dripping free replies at a company that finished and declined to pay.
export function decidePreBillingGate(
  preBilling: PreBillingFacts,
  options: ReplyGateOptions = {},
): ReplyGateDecision {
  // No company row to read (deleted mid-flight, or a caller that didn't load
  // one). Fail closed: this branch only ever describes an unpaid company.
  if (!preBilling) return { allow: false, reason: "no_plan" };
  if (preBilling.onboardingCompletedAt) return { allow: false, reason: "no_plan" };

  const allowance = options.freeReplyAllowance ?? getFreeReplyAllowance();
  if (preBilling.freeRepliesUsed >= allowance) return { allow: false, reason: "no_plan" };

  return { allow: true, overPlan: false };
}

export type ReplyGateOptions = {
  /** Override env for tests. Defaults to {@link isHardStopEnabled}. */
  hardStopEnabled?: boolean;
  /** Passed straight to {@link classifyUsage}; defaults to the env grace multiplier. */
  graceMultiplier?: number;
  /** Override env for tests. Defaults to {@link getFreeReplyAllowance}. */
  freeReplyAllowance?: number;
};

/**
 * Pure decision: given the billing row, the current-period usage row, and
 * the config, what should the channel do?
 *
 *  - no billing row              -> decidePreBillingGate: free while the
 *                                   merchant is still inside the first
 *                                   session and inside the allowance,
 *                                   `no_plan` after either runs out
 *  - status not active/trialing  -> block `lapsed` (P4: card declined /
 *                                   unpaid / canceled / incomplete)
 *  - no usage row this period    -> allow (P4 hasn't provisioned it;
 *                                   record_ai_reply would no-op too --
 *                                   "never stop from nowhere")
 *  - used < limit                -> allow
 *  - limit <= used < limit*grace -> allow + `overPlan` (P5 banner escalates)
 *  - used >= limit*grace         -> block `grace_exceeded` if the hard stop
 *                                   is armed, else allow + `overPlan`
 *
 * `trialing` is the one exception to the last two rows (2026-09-21): the
 * trial quota gets no grace head-room at all (grace=1, so "at the limit"
 * and "past grace" are the same instant), and hitting it never blocks --
 * `evaluateReplyGate` fires the auto-charge (`endTrialNow`) instead of
 * stretching the free ride. A trialing company only ever gets blocked via
 * the `lapsed` branch above, on a later call once a genuine payment failure
 * has flipped `subscription_status` away from `trialing`.
 */
export function decideReplyGate(
  billing: BillingFacts,
  usage: UsageFacts,
  options: ReplyGateOptions = {},
  preBilling: PreBillingFacts = null,
): ReplyGateDecision {
  if (!billing) return decidePreBillingGate(preBilling, options);
  if (!BILLING_ACTIVE_STATUSES.has(billing.subscription_status)) {
    return { allow: false, reason: "lapsed" };
  }
  if (!usage) return { allow: true, overPlan: false };

  const isTrialing = billing.subscription_status === "trialing";
  const graceMultiplier = isTrialing ? 1 : options.graceMultiplier;
  const standing = classifyUsage(usage.replies_used, usage.reply_limit, graceMultiplier);
  if (standing === "within") return { allow: true, overPlan: false };
  if (standing === "over_plan") return { allow: true, overPlan: true };
  if (isTrialing) return { allow: true, overPlan: true };

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
    .select("subscription_status, current_period_start, stripe_subscription_id")
    .eq("company_id", companyId)
    .maybeSingle();

  // Only read the pre-billing facts on the path that needs them: a paying
  // company pays no extra query for a branch it can never take.
  if (!billing) {
    const { data: company } = await supabase
      .from("companies")
      .select("onboarding_completed_at, free_replies_used")
      .eq("id", companyId)
      .maybeSingle();
    const facts = company as
      | { onboarding_completed_at: string | null; free_replies_used: number }
      | null;
    return decidePreBillingGate(
      facts
        ? {
            onboardingCompletedAt: facts.onboarding_completed_at,
            freeRepliesUsed: facts.free_replies_used ?? 0,
          }
        : null,
      options,
    );
  }
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

  const usageFacts = usage
    ? { replies_used: usage.replies_used as number, reply_limit: usage.reply_limit as number }
    : null;

  const decision = decideReplyGate(
    {
      subscription_status: billing.subscription_status as string,
      current_period_start: billing.current_period_start as string | null,
    },
    usageFacts,
    options,
  );

  // The side effect decideReplyGate can't own (it's pure): a trialing
  // company that has reached its trial quota gets converted to paid right
  // now instead of just being waved through with `overPlan`. Best-effort,
  // same shape as recordAiReply -- a failed or duplicate attempt (this can
  // fire more than once per company while the row still reads "trialing",
  // until P4's webhook syncs the real outcome) never throws and never
  // changes `decision`; a genuine decline surfaces as `lapsed` on a later
  // call once the webhook flips the status.
  if (
    billing.subscription_status === "trialing" &&
    usageFacts &&
    usageFacts.replies_used >= usageFacts.reply_limit &&
    billing.stripe_subscription_id
  ) {
    try {
      await endTrialNow(billing.stripe_subscription_id as string);
    } catch (err) {
      console.error("[billing] trial auto-charge failed", {
        companyId,
        error: err instanceof Error ? err.message : err,
      });
    }
  }

  return decision;
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

  // The pre-plan allowance is counted by its own writer, which no-ops the
  // moment a billing row exists -- so both calls are unconditional here and
  // exactly one of them ever does anything.
  const { error: freeError } = await supabase.rpc("record_free_reply", { p_company_id: companyId });
  if (freeError) {
    console.error("[billing] record_free_reply failed", { companyId, error: freeError.message });
  }
}
