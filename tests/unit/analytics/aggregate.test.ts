import { describe, expect, it } from "vitest";
import {
  aggregateAnalytics,
  bucketKeysInRange,
  weekStart,
  METRIC_KEYS,
} from "@/lib/analytics/aggregate";

describe("weekStart", () => {
  it("returns the Monday of the ISO week", () => {
    expect(weekStart("2026-08-28")).toBe("2026-08-24"); // Fri -> Mon
    expect(weekStart("2026-08-24")).toBe("2026-08-24"); // Mon -> itself
    expect(weekStart("2026-08-23")).toBe("2026-08-17"); // Sun -> prev Mon
  });
});

describe("bucketKeysInRange", () => {
  it("zero-fills every day in an inclusive range", () => {
    expect(bucketKeysInRange("2026-08-01", "2026-08-04", "day")).toEqual([
      "2026-08-01",
      "2026-08-02",
      "2026-08-03",
      "2026-08-04",
    ]);
  });

  it("steps by week from the Monday on/before `from`", () => {
    expect(bucketKeysInRange("2026-08-05", "2026-08-20", "week")).toEqual([
      "2026-08-03",
      "2026-08-10",
      "2026-08-17",
    ]);
  });

  it("is a single bucket when from === to", () => {
    expect(bucketKeysInRange("2026-08-10", "2026-08-10", "day")).toEqual(["2026-08-10"]);
  });
});

describe("aggregateAnalytics", () => {
  const base = {
    timezone: "UTC",
    granularity: "day" as const,
    from: "2026-08-01",
    to: "2026-08-03",
    conversations: [],
    customers: [],
    events: [],
  };

  it("returns exactly the five spec §15 metrics, in order, all zero for empty input", () => {
    const result = aggregateAnalytics(base);
    expect(result.map((m) => m.metric)).toEqual([...METRIC_KEYS]);
    for (const m of result) {
      expect(m.total).toBe(0);
      expect(m.series).toEqual([
        { date: "2026-08-01", count: 0 },
        { date: "2026-08-02", count: 0 },
        { date: "2026-08-03", count: 0 },
      ]);
    }
  });

  it("counts conversations and customers into their own day buckets", () => {
    const result = aggregateAnalytics({
      ...base,
      conversations: [
        { created_at: "2026-08-01T09:00:00Z" },
        { created_at: "2026-08-01T23:30:00Z" },
        { created_at: "2026-08-03T12:00:00Z" },
      ],
      customers: [{ created_at: "2026-08-02T00:00:00Z" }],
    });

    const conversations = result.find((m) => m.metric === "conversations")!;
    expect(conversations.total).toBe(3);
    expect(conversations.series).toEqual([
      { date: "2026-08-01", count: 2 },
      { date: "2026-08-02", count: 0 },
      { date: "2026-08-03", count: 1 },
    ]);

    const customers = result.find((m) => m.metric === "customers")!;
    expect(customers.total).toBe(1);
    expect(customers.series[1]).toEqual({ date: "2026-08-02", count: 1 });
  });

  it("maps event types to their dashboard metric keys and ignores unknown types", () => {
    const result = aggregateAnalytics({
      ...base,
      events: [
        { created_at: "2026-08-01T10:00:00Z", type: "product_recommendation" },
        { created_at: "2026-08-01T11:00:00Z", type: "product_recommendation" },
        { created_at: "2026-08-02T10:00:00Z", type: "buying_intent" },
        { created_at: "2026-08-03T10:00:00Z", type: "checkout_click" },
        { created_at: "2026-08-03T10:05:00Z", type: "something_else_entirely" },
      ],
    });

    expect(result.find((m) => m.metric === "product_recommendations")!.total).toBe(2);
    expect(result.find((m) => m.metric === "buying_intent")!.total).toBe(1);
    expect(result.find((m) => m.metric === "checkout_clicks")!.total).toBe(1);
  });

  it("buckets by the merchant's timezone, not UTC", () => {
    // 2026-08-02T02:00:00Z is still Aug 1 in São Paulo (UTC-3).
    const result = aggregateAnalytics({
      ...base,
      timezone: "America/Sao_Paulo",
      conversations: [{ created_at: "2026-08-02T02:00:00Z" }],
    });
    const conversations = result.find((m) => m.metric === "conversations")!;
    expect(conversations.series).toEqual([
      { date: "2026-08-01", count: 1 },
      { date: "2026-08-02", count: 0 },
      { date: "2026-08-03", count: 0 },
    ]);
  });

  it("drops rows whose local date falls outside the requested range", () => {
    const result = aggregateAnalytics({
      ...base,
      conversations: [
        { created_at: "2026-07-31T12:00:00Z" }, // before range
        { created_at: "2026-08-02T12:00:00Z" }, // in range
        { created_at: "2026-08-04T12:00:00Z" }, // after range
      ],
    });
    expect(result.find((m) => m.metric === "conversations")!.total).toBe(1);
  });

  it("groups into weekly buckets when granularity is week", () => {
    const result = aggregateAnalytics({
      timezone: "UTC",
      granularity: "week",
      from: "2026-08-03", // Monday
      to: "2026-08-16", // Sunday, two full weeks
      conversations: [
        { created_at: "2026-08-04T00:00:00Z" },
        { created_at: "2026-08-09T00:00:00Z" }, // same week as Aug 4
        { created_at: "2026-08-11T00:00:00Z" }, // next week
      ],
      customers: [],
      events: [],
    });

    const conversations = result.find((m) => m.metric === "conversations")!;
    expect(conversations.total).toBe(3);
    expect(conversations.series).toEqual([
      { date: "2026-08-03", count: 2 },
      { date: "2026-08-10", count: 1 },
    ]);
  });
});
