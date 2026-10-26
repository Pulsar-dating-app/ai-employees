// Which merchant nudge e-mail, if any, a company is due (table
// `merchant_nudges`, cron /api/cron/merchant-nudges). Pure, so the rules are
// unit-tested without a database or a mail server.
//
// Two kinds, each sent to a company at most once:
// - onboarding_stalled: signed up, didn't finish the first session.
// - not_live: finished it, but nothing puts the hire in front of a customer
//   yet (no connected account, no allowed site, no real conversation).
export const NUDGE_KINDS = ["onboarding_stalled", "not_live"] as const;
export type NudgeKind = (typeof NUDGE_KINDS)[number];

const HOUR = 60 * 60 * 1000;
// Long enough that someone mid-setup isn't interrupted; soon enough that
// the sign-up is still fresh in their mind.
export const NUDGE_AFTER_MS = 24 * HOUR;
// Accounts older than this are left alone: a first nudge a fortnight later
// reads as spam, not help. Also bounds what the cron scans.
export const NUDGE_MAX_AGE_MS = 7 * 24 * HOUR;
// Never two nudges close together, even of different kinds.
export const NUDGE_MIN_GAP_MS = 72 * HOUR;

export type NudgeFacts = {
  companyCreatedAt: Date;
  onboardingDone: boolean;
  channelLive: boolean;
  sent: { kind: NudgeKind; sentAt: Date }[];
};

export function dueNudge(facts: NudgeFacts, now: Date = new Date()): NudgeKind | null {
  const age = now.getTime() - facts.companyCreatedAt.getTime();
  if (age < NUDGE_AFTER_MS || age > NUDGE_MAX_AGE_MS) return null;
  if (facts.sent.some((s) => now.getTime() - s.sentAt.getTime() < NUDGE_MIN_GAP_MS)) return null;

  const kind: NudgeKind | null = !facts.onboardingDone ? "onboarding_stalled" : !facts.channelLive ? "not_live" : null;
  if (!kind || facts.sent.some((s) => s.kind === kind)) return null;
  return kind;
}
