import type { SupabaseClient } from "@supabase/supabase-js";
import { CompanyRepository, type PolicyInformation } from "@/lib/companies/repository";
import { AppointmentRepository } from "@/lib/appointments/repository";
import { ProductRepository } from "@/lib/products/repository";
import { countActiveProfessionals } from "@/lib/professionals/repository";
import { classifyServiceChoice, type ServiceChoice } from "./prompt";

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

// Shipping/return/payment policy and FAQ, read in one query for
// buildStoreInformationSection. This walks back part of C3's "policies only
// on demand" split -- see decisions.md (2026-09-21) for why -- but only for
// these four fields; the rest of `companies` still sits behind its tool.
export async function loadPolicies(supabase: SupabaseClient, companyId: string): Promise<PolicyInformation[]> {
  return CompanyRepository.getAllPolicyInformation(companyId, supabase);
}

// Whether this business has exactly one thing to book, from the same read
// list_services does (so the two can never disagree about what "one service"
// means). One small `services` query; null for any other shape.
export async function loadServiceChoice(
  supabase: SupabaseClient,
  companyId: string,
): Promise<ServiceChoice | null> {
  return classifyServiceChoice(await AppointmentRepository.listServices(companyId, supabase));
}

// 2026-09-24 -- whether the business has more than one active professional
// (one schedule each). One count query, only for an agent that can schedule.
export async function loadMultipleProfessionals(supabase: SupabaseClient, companyId: string): Promise<boolean> {
  return (await countActiveProfessionals(supabase, companyId)) > 1;
}

// Whether this company has any product at all, from the same count
// ProductRepository.hasProducts uses (so search_products' own catalogEmpty
// signal and this can never disagree).
export async function loadHasProducts(supabase: SupabaseClient, companyId: string): Promise<boolean> {
  return ProductRepository.hasProducts(companyId, supabase);
}

// Whether the merchant has set any opening hours (one count query, the same one
// find_available_slots uses to tell "no hours" from "no free slot").
export async function loadHasBusinessHours(supabase: SupabaseClient, companyId: string): Promise<boolean> {
  return AppointmentRepository.hasBusinessHours(companyId, supabase);
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

// A merchant-facing switch: whether the agent may hand off to a human at
// all (the request_human tool -- C5, now actually enforced by F5). Defaults
// true (companies.allow_human_handoff is NOT NULL DEFAULT true) so no
// existing company loses the capability it already had. `data` is null
// only if the company row itself is somehow missing, which shouldn't
// happen this deep into a conversation already resolved against it --
// fails open (true) rather than silently stripping an escalation path a
// merchant never chose to remove.
export async function loadHumanHandoffEnabled(supabase: SupabaseClient, companyId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("companies")
    .select("allow_human_handoff")
    .eq("id", companyId)
    .maybeSingle();
  if (error) throw error;
  return data?.allow_human_handoff ?? true;
}
