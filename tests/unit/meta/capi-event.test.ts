import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { buildCapiEvent, clientIpFrom } from "@/lib/meta/capi-event";
import { isTrackedHost } from "@/lib/meta/pixel";

// The Conversions API rejects unhashed personal data and can only match an
// ad click with fbp/fbc/IP/user agent, so the payload shape is what decides
// whether a sign-up is attributed at all.

const BASE = {
  eventName: "CompleteRegistration",
  eventId: "evt-1",
  eventTime: new Date("2026-10-23T12:00:00.000Z"),
  sourceUrl: "https://staffra.io/comecar",
  email: "  Dono@Barbearia.com ",
  fbp: "fb.1.1700000000000.123",
  fbc: "fb.1.1700000000000.AbCdEf",
  clientIp: "203.0.113.7",
  userAgent: "Mozilla/5.0",
};

describe("buildCapiEvent", () => {
  it("hashes the normalised email and never sends it in clear", () => {
    const event = buildCapiEvent(BASE);
    const expected = createHash("sha256").update("dono@barbearia.com").digest("hex");
    expect(event.user_data.em).toEqual([expected]);
    expect(JSON.stringify(event)).not.toContain("barbearia.com");
  });

  it("carries the dedup id, a unix timestamp and the click identifiers", () => {
    const event = buildCapiEvent(BASE);
    expect(event).toMatchObject({
      event_name: "CompleteRegistration",
      event_id: "evt-1",
      event_time: 1792756800,
      action_source: "website",
      event_source_url: "https://staffra.io/comecar",
      user_data: {
        fbp: BASE.fbp,
        fbc: BASE.fbc,
        client_ip_address: "203.0.113.7",
        client_user_agent: "Mozilla/5.0",
      },
    });
  });

  it("leaves out whatever is missing instead of sending empty values", () => {
    const event = buildCapiEvent({
      ...BASE,
      email: null,
      fbp: null,
      fbc: null,
      clientIp: null,
      userAgent: null,
      sourceUrl: null,
    });
    expect(event.user_data).toEqual({});
    expect(event).not.toHaveProperty("event_source_url");
  });
});

describe("clientIpFrom", () => {
  it("takes the first address of a proxy chain", () => {
    expect(clientIpFrom("203.0.113.7, 10.0.0.1")).toBe("203.0.113.7");
    expect(clientIpFrom(null)).toBeNull();
    expect(clientIpFrom("")).toBeNull();
  });
});

describe("isTrackedHost", () => {
  it("fires only on the production hosts", () => {
    expect(isTrackedHost("staffra.io")).toBe(true);
    expect(isTrackedHost("www.staffra.io")).toBe(true);
    expect(isTrackedHost("localhost")).toBe(false);
    expect(isTrackedHost("ai-employees-git-branch.vercel.app")).toBe(false);
  });
});
