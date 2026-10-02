import { describe, expect, it } from "vitest";
import { computeMetaSpend, metaMaxCents } from "@/lib/whatsapp/meta-pricing";

describe("metaMaxCents", () => {
  it("charges nothing inside the 1,000 free replies and up to R$ 0,04 per reply after", () => {
    expect(metaMaxCents(0)).toBe(0);
    expect(metaMaxCents(1_000)).toBe(0);
    expect(metaMaxCents(3_000)).toBe(8_000);
    expect(metaMaxCents(10_000)).toBe(36_000);
  });
});

describe("computeMetaSpend", () => {
  const midMonth = new Date(Date.UTC(2026, 9, 16));

  it("reports no spend and the free replies left while a number stays inside the free tier", () => {
    const spend = computeMetaSpend({ repliesPerNumber: [400], planMonthlyReplies: 3_000, now: midMonth });
    expect(spend.spentCents).toBe(0);
    expect(spend.freeRepliesLeft).toBe(600);
    expect(spend.freeRepliesTotal).toBe(1_000);
    expect(spend.ceilingCents).toBe(8_000);
    expect(spend.alertLevel).toBeNull();
  });

  it("gives each number its own free tier", () => {
    const spend = computeMetaSpend({ repliesPerNumber: [1_500, 200], planMonthlyReplies: 6_000, now: midMonth });
    expect(spend.spentCents).toBe(2_000);
    expect(spend.freeRepliesLeft).toBe(800);
    expect(spend.freeRepliesTotal).toBe(2_000);
  });

  it("projects the month from the pace so far", () => {
    const spend = computeMetaSpend({ repliesPerNumber: [1_500], planMonthlyReplies: 6_000, now: midMonth });
    expect(spend.projectedCents).toBe(metaMaxCents(Math.round(1_500 * (31 / 15))));
  });

  it("raises the 50%, 80% and 100% alerts against the plan's ceiling", () => {
    const at = (sent: number) =>
      computeMetaSpend({ repliesPerNumber: [sent], planMonthlyReplies: 3_000, now: midMonth }).alertLevel;
    expect(at(1_999)).toBeNull();
    expect(at(2_000)).toBe(50);
    expect(at(2_600)).toBe(80);
    expect(at(3_000)).toBe(100);
    expect(at(4_000)).toBe(100);
  });
});
