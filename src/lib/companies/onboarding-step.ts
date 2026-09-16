import type { SupabaseClient } from "@supabase/supabase-js";

// The four steps the merchant actually walks, in order. This is exactly what
// the rail renders, which is why "done" is deliberately not a member: having
// finished is a state, not a fifth segment.
export const ONBOARDING_STEPS = ["company", "hire", "setup", "ready"] as const;

export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

// Where the merchant stands: on one of the four steps, or past the flow.
export type OnboardingStatus = OnboardingStep | "done";

export const ONBOARDING_PATHS: Record<OnboardingStatus, string> = {
  company: "/onboarding",
  hire: "/onboarding/hire",
  setup: "/onboarding/setup",
  ready: "/onboarding/ready",
  done: "/dashboard",
};

export function stepIndex(step: OnboardingStep): number {
  return ONBOARDING_STEPS.indexOf(step);
}

export type OnboardingState = {
  step: OnboardingStatus;
  companyId: string | null;
  companyName: string | null;
  agentSlug: string | null;
  agentId: string | null;
  agentName: string | null;
};

type HiredRow = {
  agent_id: string;
  name: string | null;
  agents: { slug: string } | null;
};

export async function resolveOnboardingState(supabase: SupabaseClient): Promise<OnboardingState> {
  const empty: OnboardingState = {
    step: "company",
    companyId: null,
    companyName: null,
    agentSlug: null,
    agentId: null,
    agentName: null,
  };

  const { data: companies, error } = await supabase
    .from("companies")
    .select("id, name, onboarding_completed_at")
    .limit(1);

  // A failed read is not the same fact as "this account has no company", and
  // quietly collapsing the two is how a missing column turned into a merchant
  // bouncing between step 2 and step 1 forever: the select 400s, `data` is
  // null, and the flow concludes they never created a business. Say so loudly
  // instead -- the caller still degrades to step 1, but the reason is legible.
  if (error) {
    console.error("[onboarding] could not read company state", {
      code: error.code,
      message: error.message,
      hint: error.hint,
    });
    return empty;
  }

  const company = companies?.[0] as
    | { id: string; name: string; onboarding_completed_at: string | null }
    | undefined;
  if (!company) return empty;

  const base = { ...empty, companyId: company.id, companyName: company.name };

  // Finished once, finished for good. Checked before anything is derived from
  // the data, so a merchant who later empties their catalogue is not walked
  // back through a flow they already completed.
  if (company.onboarding_completed_at) return { ...base, step: "done" };

  // Oldest hire first, explicitly: a company that hired both would otherwise
  // have its whole setup branch decided by whichever row Postgres happened to
  // return. The first hire is the one this flow created, so it is the one the
  // flow keeps talking about.
  const { data: hiredRaw } = await supabase
    .from("company_agents")
    .select("agent_id, name, created_at, agents(slug)")
    .eq("company_id", company.id)
    .order("created_at", { ascending: true })
    .limit(1);

  const hired = (hiredRaw ?? [])[0] as unknown as HiredRow | undefined;
  const slug = hired?.agents?.slug ?? null;
  if (!hired || !slug) return { ...base, step: "hire" };

  const withAgent = {
    ...base,
    agentSlug: slug,
    agentId: hired.agent_id,
    agentName: hired.name ?? null,
  };

  // "Can she work yet?" is the only honest completion test, and it differs by
  // role: a sales hire needs a catalogue, a scheduling one needs something
  // bookable. Derived rather than stored, so an account that empties its
  // catalogue is not locked out of the flow that would refill it.
  const scheduling = slug === "ana";
  let query = supabase
    .from(scheduling ? "services" : "products")
    .select("id", { count: "exact", head: true })
    .eq("company_id", company.id)
    .eq("is_active", true);

  // Every company is trigger-seeded one catch-all `is_default` service
  // (migration 20260903170000). It ships inactive, so the is_active filter
  // already hides it -- but only by accident, and a merchant who switches it
  // on would otherwise skip this step entirely. Excluded on purpose: the
  // question is whether they configured what they actually offer.
  if (scheduling) query = query.eq("is_default", false);

  const { count } = await query;

  return { ...withAgent, step: count && count > 0 ? "ready" : "setup" };
}

// Each step page calls this. Two rules: a merchant who already finished never
// sees this flow again, whatever URL they arrive on; and one who has not
// reached a step yet is sent back to the one they are actually on. Revisiting
// an earlier step is never blocked -- only skipping ahead is.
export function redirectTargetFor(state: OnboardingState, pageStep: OnboardingStep): string | null {
  if (state.step === "done") return ONBOARDING_PATHS.done;
  return stepIndex(state.step) < stepIndex(pageStep) ? ONBOARDING_PATHS[state.step] : null;
}
