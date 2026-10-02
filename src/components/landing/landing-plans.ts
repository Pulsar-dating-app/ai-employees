import { annualPriceCents } from "@/lib/billing/plans";

export type WhatsAppMode = "own" | "managed";
export type LandingTier = "starter" | "intermediate" | "pro";

export const META_FREE_REPLIES = 1_000;
export const META_MAX_CENTS_PER_REPLY = 4;

export const LANDING_PLANS: readonly {
  tier: LandingTier;
  monthlyReplies: number;
  ownCents: number;
  managedCents: number;
}[] = [
  { tier: "starter", monthlyReplies: 3_000, ownCents: 19_700, managedCents: 49_700 },
  { tier: "intermediate", monthlyReplies: 6_000, ownCents: 31_700, managedCents: 99_700 },
  { tier: "pro", monthlyReplies: 10_000, ownCents: 49_700, managedCents: 159_700 },
];

export function monthlyCents(plan: (typeof LANDING_PLANS)[number], mode: WhatsAppMode): number {
  return mode === "own" ? plan.ownCents : plan.managedCents;
}

export function annualCents(plan: (typeof LANDING_PLANS)[number], mode: WhatsAppMode): number {
  return annualPriceCents(monthlyCents(plan, mode));
}

export function metaMaxCents(monthlyReplies: number): number {
  return Math.max(0, monthlyReplies - META_FREE_REPLIES) * META_MAX_CENTS_PER_REPLY;
}

export function maxMonthlySavingsCents(): number {
  return Math.max(
    ...LANDING_PLANS.map((p) => p.managedCents - p.ownCents - metaMaxCents(p.monthlyReplies)),
  );
}
