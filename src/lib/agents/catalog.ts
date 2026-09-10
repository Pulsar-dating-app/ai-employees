// Presentation enrichment for agents actually in the database — the
// unified My Team page and per-agent detail page are dynamic over every
// active `agents` row (see dashboard/page.tsx and
// agents/[agentSlug]/page.tsx); this file only adds richer content (trait
// chips, "what they do/never do") where real product-spec content exists
// for that slug, keyed by `agents.slug`. An agent with no entry here still
// shows fully — role + description straight from the DB, no fabricated
// trait chips. Trait lists have no DB column of their own
// (`agents.personality` is free-text and currently unset for every seeded
// agent), so this stays a curated, spec-sourced supplement, not a
// substitute for the DB being the roster.

export type AgentEnrichment = {
  traits: string[];
  should: string[];
  never: string[];
};

// Trello P6: agents are no longer individually priced. Access to every
// hired agent is covered by the company's subscription plan (a monthly
// AI-reply quota shared across all active bots — see
// .claude/docs/architecture.md#billing-stripe--epic-p). Price display lives
// on /dashboard/settings/billing, not per agent.

export const AGENT_ENRICHMENT: Record<string, AgentEnrichment> = {
  malu: {
    traits: ["warm", "attentive", "persuasive", "knowledgeable", "proactive"],
    should: ["askFollowUp", "explainFit", "handleObjections", "guideCheckout"],
    never: ["pushAggressively", "inventInfo", "soundGeneric"],
  },
};
