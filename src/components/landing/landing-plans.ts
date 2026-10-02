import { annualPriceCents, getPlan } from "@/lib/billing/plans";
import { META_FREE_REPLIES, META_MAX_CENTS_PER_REPLY, metaMaxCents } from "@/lib/whatsapp/meta-pricing";

export { META_FREE_REPLIES, META_MAX_CENTS_PER_REPLY, metaMaxCents };

export type WhatsAppMode = "own" | "managed";
export type LandingTier = "starter" | "intermediate" | "pro";

const TIERS: readonly LandingTier[] = ["starter", "intermediate", "pro"];

export const LANDING_PLANS: readonly {
  tier: LandingTier;
  monthlyReplies: number;
  ownCents: number;
  managedCents: number;
}[] = TIERS.map((tier) => ({
  tier,
  monthlyReplies: getPlan(tier).monthlyReplyLimit!,
  ownCents: getPlan(tier).priceBrlCents!,
  managedCents: getPlan(`${tier}_wpp`).priceBrlCents!,
}));

export function monthlyCents(plan: (typeof LANDING_PLANS)[number], mode: WhatsAppMode): number {
  return mode === "own" ? plan.ownCents : plan.managedCents;
}

export function annualCents(plan: (typeof LANDING_PLANS)[number], mode: WhatsAppMode): number {
  return annualPriceCents(monthlyCents(plan, mode));
}

export function maxMonthlySavingsCents(): number {
  return Math.max(
    ...LANDING_PLANS.map((p) => p.managedCents - p.ownCents - metaMaxCents(p.monthlyReplies)),
  );
}
