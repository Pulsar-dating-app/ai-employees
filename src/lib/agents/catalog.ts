// Presentation metadata for the marketplace/detail/settings screens — trait
// chips, price, and tutorial copy have no columns on `agents` (personality
// is a free-text prompt field, not structured), so this is the one place
// that maps a slug to how it's *shown*, kept separate from what's in the DB.
// Locked entries (no DB row, not hireable) live here too since they're
// roadmap facts from the product spec, not database state.

export type AgentTrait = string;

export type HireableAgentCatalogEntry = {
  slug: string;
  colorRole: "intent";
  monthlyPriceBRL: number;
  traits: AgentTrait[];
  should: string[];
  never: string[];
};

export type LockedAgentCatalogEntry = {
  slug: string;
  role: string;
  colorRole: "locked";
};

export const HIREABLE_AGENTS: Record<string, HireableAgentCatalogEntry> = {
  malu: {
    slug: "malu",
    colorRole: "intent",
    // Placeholder pricing — no billing system exists yet (MVP scope
    // excludes payment processing); this is what the mocked hire flow
    // displays and confirms, not a real charge.
    monthlyPriceBRL: 197,
    traits: ["warm", "attentive", "persuasive", "knowledgeable", "proactive"],
    should: ["askFollowUp", "explainFit", "handleObjections", "guideCheckout"],
    never: ["pushAggressively", "inventInfo", "soundGeneric"],
  },
};

// Roadmap agents named in the product spec's long-term architecture
// (Malu/Sales today; Emma/Support and Mia/CS later) — shown locked in the
// marketplace to sell the "AI employees" vision without pretending they're
// hireable yet.
export const LOCKED_AGENTS: LockedAgentCatalogEntry[] = [
  { slug: "emma", role: "support", colorRole: "locked" },
  { slug: "mia", role: "customerService", colorRole: "locked" },
];
