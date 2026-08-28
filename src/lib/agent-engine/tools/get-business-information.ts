import { CompanyRepository } from "@/lib/companies/repository";
import type { AgentTool } from "./types";

// Trello C3 -- spec §18 grounding: business identity/contact facts must
// come from here, never be guessed. No args -- always scoped to
// ctx.companyId, same trust rule as every other tool in this directory
// (never a companyId taken from model-supplied args).
export const getBusinessInformationTool: AgentTool = {
  name: "get_business_information",
  description:
    "Get this business's real name, description, contact details, and industry. Call this " +
    "whenever you need to ground yourself in who you're representing -- e.g. early in a new " +
    "conversation, or if the customer asks something about the business itself (what it is, how " +
    "to contact it, what it sells). Any field not on file comes back null -- never guess or " +
    "invent a value for it, and never make up a fact about the business that isn't returned here.",
  parameters: {
    type: "object",
    properties: {},
    additionalProperties: false,
  },
  async execute(_rawArgs, ctx) {
    return CompanyRepository.getBusinessInformation(ctx.companyId, ctx.supabase);
  },
};
