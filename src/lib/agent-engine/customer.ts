import type { SupabaseClient } from "@supabase/supabase-js";

export type Customer = {
  id: string;
  name: string | null;
  phone: string | null;
  channel: string | null;
};

// Step 3 -- scoped to company_id even though `id` alone would already be
// unique, matching every other loader in this module.
export async function loadCustomer(
  supabase: SupabaseClient,
  { companyId, customerId }: { companyId: string; customerId: string },
): Promise<Customer | null> {
  const { data, error } = await supabase
    .from("customers")
    .select("id, name, phone, channel")
    .eq("id", customerId)
    .eq("company_id", companyId)
    .maybeSingle();

  if (error) throw error;
  return data;
}
