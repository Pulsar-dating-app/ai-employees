import { createServiceClient } from "@/lib/supabase/service";
import type { SupabaseClient } from "@supabase/supabase-js";

// Trello ticket C3 -- the spec §18 grounding abstraction for business/policy
// facts, mirroring B5's ProductRepository shape and DI pattern exactly (a
// thin, deterministic wrapper; optional injectable supabaseClient,
// defaulting to the service-role client) for the same reason: the real
// caller is the Agent Engine's get_business_information/get_policy_information
// tools, invoked mid-turn while Malu is answering an inbound WhatsApp
// message -- there is no authenticated merchant Supabase session in that
// context. Any future caller must always pass a trusted companyId, never
// one taken from an unauthenticated party (same rule as ProductRepository).

export type BusinessInformation = {
  name: string | null;
  description: string | null;
  email: string | null;
  phone: string | null;
  websiteUrl: string | null;
  industry: string | null;
};

// A flat set of independently-optional fields -- a null field is
// unambiguously "not on file" on its own, no separate availability flag
// needed (unlike getPolicyInformation below, which resolves a single
// specific request and needs one explicit yes/no).
async function getBusinessInformation(
  companyId: string,
  supabaseClient?: SupabaseClient,
): Promise<BusinessInformation> {
  const serviceClient = supabaseClient ?? createServiceClient();
  const { data, error } = await serviceClient
    .from("companies")
    .select("name, description, email, phone, website_url, industry")
    .eq("id", companyId)
    .maybeSingle();

  if (error) throw error;

  return {
    name: data?.name ?? null,
    description: data?.description ?? null,
    email: data?.email ?? null,
    phone: data?.phone ?? null,
    websiteUrl: data?.website_url ?? null,
    industry: data?.industry ?? null,
  };
}

export type PolicyType = "shipping" | "return" | "payment" | "faq";

export type PolicyInformation = {
  type: PolicyType;
  // Explicit per the card's own requirement ("each tool should return an
  // explicit 'not available' / empty result rather than silently returning
  // null, so the model can honestly tell the customer the info isn't on
  // file instead of guessing") -- this is a single, specific lookup, so an
  // unambiguous flag matters more here than on getBusinessInformation's
  // multi-field shape above.
  available: boolean;
  content: string | null;
};

const POLICY_COLUMNS: Record<PolicyType, string> = {
  shipping: "shipping_policy",
  return: "return_policy",
  payment: "payment_policy",
  faq: "faq",
};

type FaqItem = { question?: unknown; answer?: unknown };

// FAQ is stored as jsonb (an array of {question, answer} pairs); the other
// three policies are plain text. Formatted here into one plain-text shape
// either way, so the model always gets the same kind of thing to read
// regardless of which type it asked for, instead of raw JSON it would
// otherwise have to interpret itself. This is still deterministic
// templating over real stored data, not generation -- nothing here can
// invent a fact, only reformat one that's actually on file.
function formatFaq(raw: unknown): string | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const lines = raw
    .map((item) => {
      const { question, answer } = (item ?? {}) as FaqItem;
      if (typeof question !== "string" || typeof answer !== "string") return null;
      return `Q: ${question}\nA: ${answer}`;
    })
    .filter((line): line is string => line !== null);
  return lines.length > 0 ? lines.join("\n\n") : null;
}

async function getPolicyInformation(
  companyId: string,
  type: PolicyType,
  supabaseClient?: SupabaseClient,
): Promise<PolicyInformation> {
  const column = POLICY_COLUMNS[type];
  // Defensive, not expected in practice -- OpenAI's own enum validation on
  // the tool schema should already keep `type` to the four known values,
  // but a tool must never throw over a caller-supplied value it can't
  // fully trust (see AgentTool's own contract in tools/types.ts).
  if (!column) return { type, available: false, content: null };

  const serviceClient = supabaseClient ?? createServiceClient();
  const { data, error } = await serviceClient.from("companies").select(column).eq("id", companyId).maybeSingle();

  if (error) throw error;

  const raw = (data as Record<string, unknown> | null)?.[column] ?? null;
  const content = type === "faq" ? formatFaq(raw) : typeof raw === "string" && raw.trim() ? raw : null;

  return { type, available: content !== null, content };
}

export const CompanyRepository = { getBusinessInformation, getPolicyInformation };
