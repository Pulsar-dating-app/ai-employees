// Meta's WhatsApp pricing for Brazil as Staffra quotes it to merchants on
// their own Meta account (2026-10-02): each number gets 1,000 free service
// replies a month, then each reply costs about R$ 0,035-0,04. Quotes and
// estimates use the top of that range, so the real bill should land at or
// below what the merchant was shown.
export const META_FREE_REPLIES = 1_000;
export const META_MAX_CENTS_PER_REPLY = 4;
export const META_SPEND_ALERT_LEVELS = [50, 80, 100] as const;

export type MetaSpendAlertLevel = (typeof META_SPEND_ALERT_LEVELS)[number];

export function metaMaxCents(monthlyReplies: number): number {
  return Math.max(0, monthlyReplies - META_FREE_REPLIES) * META_MAX_CENTS_PER_REPLY;
}

export type MetaSpend = {
  spentCents: number;
  projectedCents: number;
  freeRepliesLeft: number;
  freeRepliesTotal: number;
  ceilingCents: number;
  alertLevel: MetaSpendAlertLevel | null;
};

// `repliesPerNumber`: replies sent this calendar month by each Meta-direct
// number (the free tier is per number). `planMonthlyReplies`: the plan's
// monthly quota, which sets the ceiling quoted at checkout. The projection
// extrapolates the month's pace so far to the whole month.
export function computeMetaSpend(input: {
  repliesPerNumber: number[];
  planMonthlyReplies: number;
  now: Date;
}): MetaSpend {
  const { repliesPerNumber, planMonthlyReplies, now } = input;
  const daysInMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).getUTCDate();
  const monthStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);
  const elapsedDays = Math.max(1, (now.getTime() - monthStart) / 86_400_000);
  const pace = Math.min(daysInMonth / elapsedDays, daysInMonth);

  const spentCents = repliesPerNumber.reduce((sum, sent) => sum + metaMaxCents(sent), 0);
  const projectedCents = repliesPerNumber.reduce((sum, sent) => sum + metaMaxCents(Math.round(sent * pace)), 0);
  const freeRepliesLeft = repliesPerNumber.reduce((sum, sent) => sum + Math.max(0, META_FREE_REPLIES - sent), 0);
  const ceilingCents = metaMaxCents(planMonthlyReplies);

  const pct = ceilingCents > 0 ? (spentCents / ceilingCents) * 100 : 0;
  const alertLevel = [...META_SPEND_ALERT_LEVELS].reverse().find((level) => pct >= level) ?? null;

  return {
    spentCents,
    projectedCents,
    freeRepliesLeft,
    freeRepliesTotal: repliesPerNumber.length * META_FREE_REPLIES,
    ceilingCents,
    alertLevel,
  };
}
