import { describe, expect, it } from "vitest";
import { CompanyRepository } from "@/lib/companies/repository";
import { api } from "./helpers/request";
import { signUpTestUser } from "./helpers/auth";
import { getTestServiceClient } from "./helpers/service-client";

// Trello C3 -- same documented deviation as tests/integration/agent-engine.test.ts:
// imports CompanyRepository directly rather than going through an HTTP
// route, since (like the Agent Engine) its real caller is a tool invoked
// in-process, not a route. Company data is seeded through the real
// PATCH /api/companies/:id route (B2), whose own file comment says its
// field names/shapes are exactly what this repository reads at runtime --
// keeping this test on that route catches a drift between the two early.
describe("CompanyRepository", () => {
  async function createCompany(ownerCookie: string, name: string) {
    const created = await api<{ company: { id: string } }>("POST", "/api/companies", ownerCookie, { name });
    return created.json.company.id;
  }

  describe("getBusinessInformation", () => {
    it("returns real fields from the companies row", async () => {
      const owner = await signUpTestUser("owner");
      const companyId = await createCompany(owner.cookieHeader, "Info Co");

      await api("PATCH", `/api/companies/${companyId}`, owner.cookieHeader, {
        description: "A cozy neighborhood bookstore",
        email: "hello@infoco.test",
        phone: "+15551234567",
        website_url: "https://infoco.test",
        address: "123 Main St, Springfield",
        industry: "Retail",
      });

      const info = await CompanyRepository.getBusinessInformation(companyId, getTestServiceClient());
      expect(info).toEqual({
        name: "Info Co",
        description: "A cozy neighborhood bookstore",
        email: "hello@infoco.test",
        phone: "+15551234567",
        websiteUrl: "https://infoco.test",
        address: "123 Main St, Springfield",
        industry: "Retail",
      });
    });

    it("returns null, not an error, for fields never set", async () => {
      const owner = await signUpTestUser("owner");
      const companyId = await createCompany(owner.cookieHeader, "Bare Co");

      const info = await CompanyRepository.getBusinessInformation(companyId, getTestServiceClient());
      expect(info.description).toBeNull();
      expect(info.email).toBeNull();
      expect(info.industry).toBeNull();
    });
  });

  describe("getPolicyInformation", () => {
    it("returns available: true with the real policy text when it's set", async () => {
      const owner = await signUpTestUser("owner");
      const companyId = await createCompany(owner.cookieHeader, "Policy Co");

      await api("PATCH", `/api/companies/${companyId}`, owner.cookieHeader, {
        shipping_policy: "Ships within 3-5 business days across the country.",
      });

      const policy = await CompanyRepository.getPolicyInformation(companyId, "shipping", getTestServiceClient());
      expect(policy).toEqual({
        type: "shipping",
        available: true,
        content: "Ships within 3-5 business days across the country.",
      });
    });

    it("returns available: false with null content, not an error, when a policy was never set", async () => {
      const owner = await signUpTestUser("owner");
      const companyId = await createCompany(owner.cookieHeader, "No Policy Co");

      const policy = await CompanyRepository.getPolicyInformation(companyId, "return", getTestServiceClient());
      expect(policy).toEqual({ type: "return", available: false, content: null });
    });

    it("formats faq (jsonb array) into readable Q/A text", async () => {
      const owner = await signUpTestUser("owner");
      const companyId = await createCompany(owner.cookieHeader, "Faq Co");

      await api("PATCH", `/api/companies/${companyId}`, owner.cookieHeader, {
        faq: [
          { question: "Do you ship internationally?", answer: "Not yet." },
          { question: "Can I cancel an order?", answer: "Within 24 hours, yes." },
        ],
      });

      const policy = await CompanyRepository.getPolicyInformation(companyId, "faq", getTestServiceClient());
      expect(policy.available).toBe(true);
      expect(policy.content).toBe(
        "Q: Do you ship internationally?\nA: Not yet.\n\n" + "Q: Can I cancel an order?\nA: Within 24 hours, yes.",
      );
    });

    it("returns available: false for an empty faq array", async () => {
      const owner = await signUpTestUser("owner");
      const companyId = await createCompany(owner.cookieHeader, "Empty Faq Co");

      await api("PATCH", `/api/companies/${companyId}`, owner.cookieHeader, { faq: [] });

      const policy = await CompanyRepository.getPolicyInformation(companyId, "faq", getTestServiceClient());
      expect(policy).toEqual({ type: "faq", available: false, content: null });
    });
  });
});
