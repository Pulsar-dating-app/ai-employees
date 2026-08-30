import type { SupabaseClient } from "@supabase/supabase-js";

// Step 4 -- Trello C3 replaced this step's original stub (a full,
// unfiltered read of every companies.* field, injected into every system
// prompt call regardless of whether it was relevant) with real retrieval:
// only the business name is still loaded unconditionally here -- cheap,
// and always relevant since Malu needs to know who she represents from her
// very first reply. Everything else that used to live here (description,
// contact, industry, shipping/return/payment policy, FAQ) is now fetched
// on demand via the get_business_information/get_policy_information tools
// (src/lib/agent-engine/tools/, backed by src/lib/companies/repository.ts)
// instead, matching spec §18: "the LLM must not be trusted to invent
// factual business information" -- a fact never force-fed into the prompt
// is a fact that can never be misquoted from stale/irrelevant context.
export async function loadBusinessName(supabase: SupabaseClient, companyId: string): Promise<string | null> {
  const { data, error } = await supabase.from("companies").select("name").eq("id", companyId).maybeSingle();
  if (error) throw error;
  return data?.name ?? null;
}

// Also loaded unconditionally, same "cheap and always relevant" rationale as
// the name above: any agent that reasons about time at all (Ana resolving
// "next Thursday", Malu quoting a delivery estimate) needs to know both what
// day it is and in which timezone the business operates -- and neither is a
// fact the model can invent. `null` -> the caller falls back to "UTC".
export async function loadCompanyTimezone(
  supabase: SupabaseClient,
  companyId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("companies")
    .select("timezone")
    .eq("id", companyId)
    .maybeSingle();
  if (error) throw error;
  return data?.timezone ?? null;
}
