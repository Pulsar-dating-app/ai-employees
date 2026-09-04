// Trello P7 -- the soft-cap knobs for the monthly AI-reply quota.
//
// The plan reply limits themselves are still placeholders (`plans.ts`), but
// the grace policy itself is decided (2026-09-04, see decisions.md): 20%
// head-room past 100%, then blocked. Both knobs still live in env so a
// deploy can tune the number or, as an ops kill switch, disarm the hard
// stop without a code change -- but the *shipped* default now enforces it.

// How far past 100% of the plan's snapshotted `reply_limit` the bots keep
// answering before the hard stop engages. 1.2 = 20% head-room -- the
// decided number. Override with BILLING_GRACE_MULTIPLIER.
const DEFAULT_GRACE_MULTIPLIER = 1.2;

// Whether crossing `reply_limit * grace_multiplier` actually stops the AI.
// Armed by default: past the 20% grace band, the AI is skipped in favor of
// the canned QUOTA_EXCEEDED_CUSTOMER_TEXT line (nothing is charged either
// way -- AgentEngine.run() never runs). Set BILLING_HARD_STOP_ENABLED=false
// as an escape hatch if the policy ever needs to be paused without a deploy.
const DEFAULT_HARD_STOP_ENABLED = true;

/**
 * The grace multiplier from env, or {@link DEFAULT_GRACE_MULTIPLIER}. A
 * missing, non-numeric, or `< 1` value falls back rather than silently
 * collapsing the grace band (a multiplier below 1 would block *before* the
 * plan limit).
 */
export function getGraceMultiplier(): number {
  const raw = process.env.BILLING_GRACE_MULTIPLIER;
  if (raw === undefined || raw === "") return DEFAULT_GRACE_MULTIPLIER;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 1) return DEFAULT_GRACE_MULTIPLIER;
  return parsed;
}

/** Whether the hard stop past the grace band is armed (default: yes). */
export function isHardStopEnabled(): boolean {
  if (process.env.BILLING_HARD_STOP_ENABLED === undefined) return DEFAULT_HARD_STOP_ENABLED;
  return process.env.BILLING_HARD_STOP_ENABLED === "true";
}

export type UsageStanding = "within" | "over_plan" | "past_grace";

/**
 * Where this period's usage sits relative to the plan limit:
 *  - `within`     -> under 100%, business as usual
 *  - `over_plan`  -> at/over the limit but inside the grace band; still
 *                    answering, but the merchant banner should escalate
 *  - `past_grace` -> at/over `limit * grace_multiplier`; the hard stop
 *                    engages here *if* it's enabled
 *
 * A non-positive `replyLimit` is treated as `within` -- an unusable limit
 * must never be what silences a paying customer's bots.
 */
export function classifyUsage(
  repliesUsed: number,
  replyLimit: number,
  graceMultiplier: number = getGraceMultiplier(),
): UsageStanding {
  if (replyLimit <= 0) return "within";
  if (repliesUsed < replyLimit) return "within";
  if (repliesUsed < replyLimit * graceMultiplier) return "over_plan";
  return "past_grace";
}
