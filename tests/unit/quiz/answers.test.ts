import { describe, expect, it } from "vitest";
import { SERVICE_PRESET_TRADES } from "@/lib/appointments/service-presets";
import { getPlan } from "@/lib/billing/plans";
import { VERTICALS } from "@/lib/verticals/catalog";
import {
  businessFromVerticalSlug,
  parseQuizAnswers,
  QUIZ_BUSINESSES,
  QUIZ_VOLUMES,
  quizAgentSlug,
  quizServiceTrade,
  quizTier,
  serializeQuizAnswers,
  type QuizAnswers,
} from "@/lib/quiz/answers";

// The quiz answers ride through a cookie and auth metadata, both
// visitor-controlled, and onboarding trusts them to pre-select a hire, a
// service list and a plan. Anything malformed must come back as null rather
// than as a half-filled object a step would then act on.

const VALID: QuizAnswers = { business: "barber", volume: "mid", pain: "afterHours" };

describe("parseQuizAnswers", () => {
  it("round-trips through serialize", () => {
    expect(parseQuizAnswers(serializeQuizAnswers(VALID))).toEqual(VALID);
  });

  it("accepts an already-parsed object, as auth metadata returns it", () => {
    expect(parseQuizAnswers({ ...VALID })).toEqual(VALID);
  });

  it("drops unknown extra fields", () => {
    expect(parseQuizAnswers({ ...VALID, admin: true })).toEqual(VALID);
  });

  it.each([
    ["missing", undefined],
    ["null", null],
    ["not JSON", "{oops"],
    ["a number", 42],
    ["partial", { business: "barber", volume: "mid" }],
    ["unknown volume", { ...VALID, volume: "huge" }],
    ["unknown business", { ...VALID, business: "bakery" }],
    ["unknown pain", { ...VALID, pain: "taxes" }],
  ])("rejects %s", (_label, raw) => {
    expect(parseQuizAnswers(raw)).toBeNull();
  });
});

describe("mapping answers onto onboarding", () => {
  it("sends a store to the sales hire and every trade to scheduling", () => {
    for (const b of QUIZ_BUSINESSES) {
      expect(quizAgentSlug({ ...VALID, business: b.key })).toBe(b.key === "store" ? "malu" : "ana");
    }
  });

  it("only names service presets that exist, and none for the sales hire", () => {
    for (const b of QUIZ_BUSINESSES) {
      const trade = quizServiceTrade({ ...VALID, business: b.key });
      if (trade) expect(SERVICE_PRESET_TRADES).toContain(trade);
      if (b.agent === "malu") expect(trade).toBeNull();
    }
  });

  it("picks a bigger self-serve tier for each bigger volume", () => {
    const quotas = QUIZ_VOLUMES.map((v) => {
      const plan = getPlan(quizTier({ ...VALID, volume: v.key }));
      expect(plan.isSelfServe).toBe(true);
      return plan.monthlyReplyLimit!;
    });
    expect([...quotas].sort((a, b) => a - b)).toEqual(quotas);
    expect(new Set(quotas).size).toBe(quotas.length);
  });
});

describe("businessFromVerticalSlug", () => {
  it("maps every per-trade landing slug to a quiz business", () => {
    for (const v of VERTICALS) {
      expect(businessFromVerticalSlug(v.slug)).toBe(v.key);
    }
  });

  it("ignores unknown or empty slugs", () => {
    expect(businessFromVerticalSlug("padarias")).toBeNull();
    expect(businessFromVerticalSlug("")).toBeNull();
    expect(businessFromVerticalSlug(undefined)).toBeNull();
  });
});
