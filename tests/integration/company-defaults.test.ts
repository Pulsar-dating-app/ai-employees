import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { signUpTestUser } from "./helpers/auth";
import { getTestServiceClient } from "./helpers/service-client";

// Onboarding creates the company with no currency or country, and Settings
// asked for both until the merchant picked them. Companies now start on BRL
// and Brazil unless the caller gives something else.
describe("Company currency and country defaults", () => {
  async function create(currency: string | null, country: string | null = null) {
    const owner = await signUpTestUser("currency-owner");
    const { data, error } = await owner.client.rpc("create_company_with_owner", {
      company_name: `Currency Co ${randomUUID().slice(0, 8)}`,
      company_email: null,
      company_phone: null,
      company_website_url: null,
      company_description: null,
      company_currency: currency,
      company_country: country,
      company_timezone: null,
    });
    if (error) throw error;
    const { data: row } = await getTestServiceClient()
      .from("companies")
      .select("currency, country")
      .eq("id", (data as { id: string }).id)
      .single();
    return row as { currency: string | null; country: string | null };
  }

  it("starts a company created without them on BRL and Brazil", async () => {
    expect(await create(null)).toEqual({ currency: "BRL", country: "BR" });
  });

  it("keeps what the caller chose", async () => {
    expect(await create("EUR", "IT")).toEqual({ currency: "EUR", country: "IT" });
  });
});
