import type { SupabaseClient } from "@supabase/supabase-js";

export type BusinessKnowledge = {
  name: string | null;
  description: string | null;
  shippingPolicy: string | null;
  returnPolicy: string | null;
  paymentPolicy: string | null;
  faq: unknown;
  additionalInformation: string | null;
};

// Step 4 -- the card explicitly allows "stub/direct-read" here to unblock
// C1: this is a full-row read of B2's data with no relevance filtering.
// Real retrieval (picking which knowledge is relevant to the incoming
// message) is C3's job -- this function is exactly what C3 replaces.
export async function loadBusinessKnowledge(
  supabase: SupabaseClient,
  companyId: string,
): Promise<BusinessKnowledge> {
  const { data, error } = await supabase
    .from("companies")
    .select("name, description, shipping_policy, return_policy, payment_policy, faq, additional_information")
    .eq("id", companyId)
    .maybeSingle();

  if (error) throw error;

  return {
    name: data?.name ?? null,
    description: data?.description ?? null,
    shippingPolicy: data?.shipping_policy ?? null,
    returnPolicy: data?.return_policy ?? null,
    paymentPolicy: data?.payment_policy ?? null,
    faq: data?.faq ?? null,
    additionalInformation: data?.additional_information ?? null,
  };
}
