import type { ServicePresetTrade } from "@/lib/appointments/service-presets";

// The ad-landing quiz at /comecar. A visitor answers two one-tap questions,
// and the answers travel into onboarding so nothing they told us is asked
// again: the business picks the hire and the starter service list. Every
// result is Staffra Free (owner's call): the quiz sells the card-less way in,
// and paid tiers are met later. Answers
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

export const QUIZ_PAINS = ["slowReplies", "afterHours", "busywork"] as const;

export type QuizPain = (typeof QUIZ_PAINS)[number];

export type QuizAnswers = {
  business: QuizBusiness;
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

  const { business, pain } = value as Record<string, unknown>;
  if (!isOneOf(QUIZ_BUSINESSES.map((b) => b.key), business)) return null;
  if (!isOneOf(QUIZ_PAINS, pain)) return null;
  return { business, pain };
}

export function serializeQuizAnswers(answers: QuizAnswers): string {
  return JSON.stringify({ business: answers.business, pain: answers.pain });
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

/** `?ramo=barbearias` (an ad aimed at one trade) skips the business question. */
export function businessFromVerticalSlug(slug: string | null | undefined): QuizBusiness | null {
  if (!slug) return null;
  return QUIZ_BUSINESSES.find((b) => b.vertical === slug)?.key ?? null;
}
