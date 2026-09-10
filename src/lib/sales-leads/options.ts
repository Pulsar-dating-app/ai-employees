export const SALES_LEAD_INTERESTS = ["sales", "scheduling"] as const;

export const SALES_LEAD_REFERRALS = [
  "google",
  "referral",
  "social",
  "agency",
  "influencer",
  "other",
] as const;

export type SalesLeadInterest = (typeof SALES_LEAD_INTERESTS)[number];
export type SalesLeadReferral = (typeof SALES_LEAD_REFERRALS)[number];
