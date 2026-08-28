import { CompanyRepository, type PolicyType } from "@/lib/companies/repository";
import type { AgentTool } from "./types";

type GetPolicyInformationArgs = {
  type: PolicyType;
};

const POLICY_TYPES: PolicyType[] = ["shipping", "return", "payment", "faq"];

// Trello C3 -- spec §18 grounding: policy/FAQ facts must come from here,
// never be guessed or assumed from general knowledge. companyId always
// comes from ctx, same trust rule as every other tool here.
//
// Found by hand-testing: a merchant put a real (if unusual/joke) FAQ entry
// on file, then asked the matching question in chat -- Malu never called
// this tool at all, and just answered the question plausibly from her own
// general knowledge instead, ignoring the real FAQ content entirely. Root
// cause: the trigger to call this tool was implicitly "does this look like
// a shipping/return/payment/FAQ question," and an unusual FAQ topic
// (unrelated to typical store policy) doesn't look like one -- but FAQ is
// free-form, a merchant can document literally anything there, so "doesn't
// sound like a store question" is not a safe signal that it's fine to
// answer from memory. The description below now says this explicitly.
export const getPolicyInformationTool: AgentTool = {
  name: "get_policy_information",
  description:
    "Get this business's real policy text for one topic, or its FAQ. The FAQ especially can " +
    "cover ANY topic the merchant chose to document -- not just shipping/returns/payments -- so " +
    "don't assume a question is out of scope just because it doesn't sound like a typical store " +
    "policy question. Before answering any specific, checkable question (a yes/no, a fact, a " +
    "claim about something) from your own general knowledge or assumptions, check " +
    "type=\"faq\" here first -- this business's real answer, however unexpected, always " +
    "overrides whatever you'd otherwise guess. Never answer a shipping/return/payment/FAQ " +
    "question from memory, general assumptions, or what's \"typical\" for a store -- always " +
    "call this first. If it comes back unavailable, tell the customer honestly that you don't " +
    "have that on file rather than guessing or inventing an answer.",
  parameters: {
    type: "object",
    properties: {
      type: {
        type: "string",
        enum: POLICY_TYPES,
        description: "Which policy to look up: \"shipping\", \"return\", \"payment\", or \"faq\".",
      },
    },
    required: ["type"],
    additionalProperties: false,
  },
  async execute(rawArgs, ctx) {
    const args = rawArgs as GetPolicyInformationArgs;
    return CompanyRepository.getPolicyInformation(ctx.companyId, args.type, ctx.supabase);
  },
};
