// Presentation enrichment for agents actually in the database — the
// marketplace/detail pages are dynamic over every active `agents` row
// (see dashboard/page.tsx and agents/[agentSlug]/page.tsx); this file only
// adds richer content (trait chips, "what they do/never do") where real
// product-spec content exists for that slug, keyed by `agents.slug`. An
// agent with no entry here still shows fully — role + description straight
// from the DB, the default price, no fabricated trait chips. Trait lists
// have no DB column of their own (`agents.personality` is free-text and
// currently unset for every seeded agent), so this stays a curated,
// spec-sourced supplement, not a substitute for the DB being the roster.

export type AgentEnrichment = {
  traits: string[];
  should: string[];
  never: string[];
  monthlyPriceBRL: number;
};

// No `agents` column holds a price — there is no billing system yet (see
// PRODUCT.md's MVP scope). This is what the mocked hire flow displays and
// confirms, not a real charge.
export const DEFAULT_MONTHLY_PRICE_BRL = 197;

// MOCK. There is no conversations/analytics aggregation yet (the `events`
// and `conversations` tables exist but nothing rolls them up). The
// dashboard shows this fixed number on the "my team" persona cards as a
// placeholder until real per-day counts are wired in.
export const MOCK_CONVERSATIONS_TODAY = 142;

export const AGENT_ENRICHMENT: Record<string, AgentEnrichment> = {
  malu: {
    traits: ["warm", "attentive", "persuasive", "knowledgeable", "proactive"],
    should: ["askFollowUp", "explainFit", "handleObjections", "guideCheckout"],
    never: ["pushAggressively", "inventInfo", "soundGeneric"],
    monthlyPriceBRL: 197,
  },
};
