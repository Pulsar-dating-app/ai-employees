import { describe, expect, it } from "vitest";
import { api } from "./helpers/request";
import { getTestServiceClient } from "./helpers/service-client";

// Public "Talk to a specialist" form (POST /api/sales-contact). No auth, no
// company -- writes a sales_leads row via the service-role client (the table
// has RLS on with zero policies). Rate-limited per client IP; the test
// fetch sends no x-forwarded-for, so every request here shares the one
// "unknown" bucket -- the rate-limit case only asserts that a 429 shows up
// once enough requests pile into the window, not an exact threshold.
describe("POST /api/sales-contact", () => {
  const service = getTestServiceClient();

  function validBody(overrides: Record<string, unknown> = {}) {
    return {
      name: "Ana Store",
      email: `lead-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`,
      whatsapp: "+55 (11) 90000-0000",
      interests: ["sales", "scheduling"],
      companyName: "Minha Loja Ltda",
      message: "Quero entender como funciona para a minha operação.",
      referralSource: "google",
      locale: "pt",
      ...overrides,
    };
  }

  it("stores a valid submission", async () => {
    const body = validBody();
    const res = await api<{ ok: boolean }>("POST", "/api/sales-contact", undefined, body);

    expect(res.status).toBe(201);
    expect(res.json.ok).toBe(true);

    const { data, error } = await service
      .from("sales_leads")
      .select("name, email, whatsapp, interests, company_name, message, referral_source, locale")
      .eq("email", body.email)
      .single();

    expect(error).toBeNull();
    expect(data).toMatchObject({
      name: "Ana Store",
      whatsapp: "+55 (11) 90000-0000",
      company_name: "Minha Loja Ltda",
      message: "Quero entender como funciona para a minha operação.",
      referral_source: "google",
      locale: "pt",
    });
    expect(data?.interests).toEqual(["sales", "scheduling"]);
  });

  it("accepts a submission with no referral source", async () => {
    const body = validBody({ referralSource: null });
    const res = await api<{ ok: boolean }>("POST", "/api/sales-contact", undefined, body);
    expect(res.status).toBe(201);

    const { data } = await service
      .from("sales_leads")
      .select("referral_source")
      .eq("email", body.email)
      .single();
    expect(data?.referral_source).toBeNull();
  });

  it("drops unknown interest slugs and rejects if none remain", async () => {
    const res = await api("POST", "/api/sales-contact", undefined, validBody({ interests: ["hacking", ""] }));
    expect(res.status).toBe(400);
  });

  it("keeps only the known interest slugs", async () => {
    const body = validBody({ interests: ["scheduling", "not_a_real_option"] });
    const res = await api("POST", "/api/sales-contact", undefined, body);
    expect(res.status).toBe(201);

    const { data } = await service
      .from("sales_leads")
      .select("interests")
      .eq("email", body.email)
      .single();
    expect(data?.interests).toEqual(["scheduling"]);
  });

  it.each([
    ["missing name", { name: "  " }],
    ["invalid email", { email: "not-an-email" }],
    ["too-short whatsapp", { whatsapp: "12" }],
    ["no interests", { interests: [] }],
    ["missing company name", { companyName: "  " }],
    ["missing message", { message: "" }],
    ["unknown referral", { referralSource: "carrier-pigeon" }],
  ])("rejects: %s", async (_label, override) => {
    const res = await api("POST", "/api/sales-contact", undefined, validBody(override));
    expect(res.status).toBe(400);
  });

  it("rejects a non-JSON body", async () => {
    const res = await api("POST", "/api/sales-contact", undefined, undefined);
    expect(res.status).toBe(400);
  });

  it("rate-limits repeated submissions from the same client", async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 10; i++) {
      const res = await api("POST", "/api/sales-contact", undefined, validBody());
      statuses.push(res.status);
      if (res.status === 429) break;
    }
    expect(statuses).toContain(429);
    expect(statuses.some((s) => s === 201)).toBe(true);
  });
});
