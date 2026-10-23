import type { ServicePresetTrade } from "@/lib/appointments/service-presets";
import type { PlanTier } from "@/lib/billing/plans";

// The ad-landing quiz at /comecar. A visitor answers three one-tap questions,
// and the answers travel into onboarding so nothing they told us is asked
// again: the business picks the hire and the starter service list, the volume
// picks the plan. The plan is shown without its price: the price is met at
// the onboarding plan step, after the merchant has seen her answer. Answers
// are carried twice -- a cookie set by the quiz, and the auth user's metadata
// written at sign-up -- because an ad click usually opens in Instagram's
// in-app browser, while the confirmation email opens in the phone's default
// one, where the cookie does not exist.
//
// Client-safe: the quiz component imports it.

export const QUIZ_COOKIE = "staffra_quiz";
export const QUIZ_COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

export const QUIZ_BUSINESSES = [
  { key: "barber", agent: "ana", trade: "barber", vertical: "barbearias" },
  { key: "salon", agent: "ana", trade: "salon", vertical: "saloes-de-beleza" },
  { key: "nails", agent: "ana", trade: "salon", vertical: "manicures" },
  { key: "aesthetics", agent: "ana", trade: "aesthetics", vertical: null },
  { key: "dental", agent: "ana", trade: "clinic", vertical: "clinicas-odontologicas" },
  { key: "nutri", agent: "ana", trade: "clinic", vertical: "nutricionistas" },
  { key: "pilates", agent: "ana", trade: null, vertical: "estudios-de-pilates" },
  { key: "otherScheduling", agent: "ana", trade: "other", vertical: null },
  { key: "store", agent: "malu", trade: null, vertical: null },
] as const satisfies readonly {
  key: string;
  agent: "ana" | "malu";
  trade: ServicePresetTrade | null;
  vertical: string | null;
}[];

export type QuizBusiness = (typeof QUIZ_BUSINESSES)[number]["key"];

// Conversations a day, bucketed so each bucket lands inside one tier's
// monthly reply quota (roughly six replies a conversation, 26 working days):
// up to 10 a day is ~1,600 replies (Starter, 3,000), up to 30 is ~4,700
// (Intermediate, 6,000), more than that needs Pro.
export const QUIZ_VOLUMES = [
  { key: "low", tier: "starter" },
  { key: "mid", tier: "intermediate" },
  { key: "high", tier: "pro" },
] as const satisfies readonly { key: string; tier: PlanTier }[];

export type QuizVolume = (typeof QUIZ_VOLUMES)[number]["key"];

export const QUIZ_PAINS = ["slowReplies", "afterHours", "busywork"] as const;

export type QuizPain = (typeof QUIZ_PAINS)[number];

export type QuizAnswers = {
  business: QuizBusiness;
  volume: QuizVolume;
  pain: QuizPain;
};

function isOneOf<T extends string>(values: readonly T[], value: unknown): value is T {
  return typeof value === "string" && (values as readonly string[]).includes(value);
}

/** Accepts an object or its JSON; anything malformed or partial is `null`. */
export function parseQuizAnswers(raw: unknown): QuizAnswers | null {
  let value = raw;
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      return null;
    }
  }
  if (!value || typeof value !== "object") return null;

  const { business, volume, pain } = value as Record<string, unknown>;
  if (!isOneOf(QUIZ_BUSINESSES.map((b) => b.key), business)) return null;
  if (!isOneOf(QUIZ_VOLUMES.map((v) => v.key), volume)) return null;
  if (!isOneOf(QUIZ_PAINS, pain)) return null;
  return { business, volume, pain };
}

export function serializeQuizAnswers(answers: QuizAnswers): string {
  return JSON.stringify({ business: answers.business, volume: answers.volume, pain: answers.pain });
}

function businessOf(answers: QuizAnswers) {
  return QUIZ_BUSINESSES.find((b) => b.key === answers.business)!;
}

export function quizAgentSlug(answers: QuizAnswers): "ana" | "malu" {
  return businessOf(answers).agent;
}

export function quizServiceTrade(answers: QuizAnswers): ServicePresetTrade | null {
  return businessOf(answers).trade;
}

export function quizTier(answers: QuizAnswers): PlanTier {
  return QUIZ_VOLUMES.find((v) => v.key === answers.volume)!.tier;
}

/** `?ramo=barbearias` (an ad aimed at one trade) skips the business question. */
export function businessFromVerticalSlug(slug: string | null | undefined): QuizBusiness | null {
  if (!slug) return null;
  return QUIZ_BUSINESSES.find((b) => b.vertical === slug)?.key ?? null;
}
