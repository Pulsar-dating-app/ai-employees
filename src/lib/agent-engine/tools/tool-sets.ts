import type { AgentTool } from "./types";
import { defaultTools } from "./registry";

// Trello ticket J2 -- which tools each agent is actually offered.
//
// Until now every agent received the identical `defaultTools` array, which
// only looked harmless while Malu was the only hire. With Ana (scheduling)
// seeded it becomes a real product bug in both directions: Ana would offer to
// search a product catalogue and mint checkout links, and Malu would offer to
// book appointments. A tool the model can see is a tool it will eventually
// reach for.
//
// Code-level and keyed by `agents.slug`, deliberately mirroring
// AGENT_ENRICHMENT (src/lib/agents/catalog.ts): no schema change, and the
// same "the DB is the roster, this file only enriches it" split. `agents` has
// no column for a tool list, and inventing one would make an agent's
// capabilities editable as data — which is exactly what they must not be,
// since a tool is code that has to exist to be callable.

// Every agent gets these: general business facts, the merchant's own policy
// text (the `faq` type is useful to any agent, not just a sales one), and the
// escape hatch when a question is genuinely out of scope. None of them take a
// domain action -- they only read what the merchant already wrote down.
const COMMON_TOOL_NAMES = [
  "get_business_information",
  "get_policy_information",
  "request_human",
] as const;

export const AGENT_TOOL_SETS: Record<string, readonly string[]> = {
  // Sales: catalogue, checkout, and the buying-intent signal.
  malu: [
    ...COMMON_TOOL_NAMES,
    "search_products",
    "get_product",
    "create_checkout_link",
    "flag_buying_intent",
  ],

  // Scheduling (Trello J3): the common set plus the appointment tools.
  // `list_services` is the deterministic read that grounds her in what the
  // business offers (the scheduling analog of `search_products`);
  // `find_available_slots` calls I2's availability engine;
  // `book_appointment` / `cancel_appointment` write the `appointments` row.
  // Notably she gets NO catalogue or checkout tools: a scheduling assistant
  // offering to sell a product is the exact failure J2 exists to prevent.
  ana: [
    ...COMMON_TOOL_NAMES,
    "list_services",
    "find_available_slots",
    "book_appointment",
    "cancel_appointment",
  ],
};

export class UnknownToolNameError extends Error {
  constructor(agentSlug: string, toolName: string) {
    super(
      `AGENT_TOOL_SETS["${agentSlug}"] lists "${toolName}", which no registered tool provides. ` +
        `Registered: ${defaultTools.map((t) => t.name).join(", ")}.`,
    );
    this.name = "UnknownToolNameError";
  }
}

// An agent with no entry gets the common set, never the full registry.
//
// This direction is chosen deliberately. An unmapped agent falling back to
// *everything* would silently reintroduce the exact bug this ticket fixes,
// and do it invisibly -- a newly seeded agent would quietly start offering to
// sell products. Falling back to the common set fails the safe way instead:
// the agent can still answer questions and escalate, and the missing
// capability shows up as "she won't book anything" the first time someone
// tries it, which is noticeable and cheap to fix by adding an entry here.
export function resolveToolsForAgent(
  agentSlug: string,
  availableTools: AgentTool[] = defaultTools,
): AgentTool[] {
  const names = AGENT_TOOL_SETS[agentSlug] ?? COMMON_TOOL_NAMES;
  const byName = new Map(availableTools.map((tool) => [tool.name, tool]));

  return names.map((name) => {
    const tool = byName.get(name);
    // A typo here would silently strip a capability, which is the hardest
    // kind of bug to notice in an LLM product -- the agent just quietly stops
    // being able to do something. Fail loudly instead; a unit test pins every
    // entry so this can never reach production.
    if (!tool) throw new UnknownToolNameError(agentSlug, name);
    return tool;
  });
}
