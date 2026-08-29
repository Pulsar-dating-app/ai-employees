import type OpenAI from "openai";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AgentTool } from "./tools/types";
import type { GroundingClaim } from "./grounding";

// Trello ticket C1 -- the Agent Engine's public contract (spec §17). The
// pipeline only starts once a `conversations` row already exists -- finding
// or creating that row (which customer, which channel) is future D2 routing
// logic, not this engine's job. companyId still travels alongside
// conversationId and is cross-checked against the loaded row's own
// company_id, so a caller can never read/act on another company's
// conversation by guessing an id (same "never trust one id alone" rule B5's
// ProductRepository follows).
export type AgentEngineInput = {
  companyId: string;
  conversationId: string;
  message: string;
};

// Trello C7 -- what the step-10 grounding check did to this turn.
// `grounded`: the first draft passed, nothing was changed. `regenerated`: the
// first draft quoted a figure it hadn't retrieved, and the retry passed.
// `blocked`: both drafts failed, so `responseText` is the safe fallback and
// neither draft was ever sent. `violations` always describes the *first*
// failure (the one that triggered the intervention), and is empty when
// `grounded`. Surfaced rather than kept internal so G1's QA pass -- which
// exists specifically to try to break this -- can see it fire, and so
// dev-chat-test can flag it while hand-testing.
export type GroundingOutcome = {
  status: "grounded" | "regenerated" | "blocked";
  violations: GroundingClaim[];
};

export type AgentEngineResult = {
  responseText: string;
  conversationId: string;
  openAiConversationId: string;
  grounding: GroundingOutcome;
};

// Every dependency is injectable and defaults to the real production
// implementation -- this is what lets a unit test exercise the tool-call
// loop with a fake OpenAI client, and an integration test point `supabase`
// at the local test stack's service-role client instead of whatever
// `createServiceClient()` would resolve to from `.env.local`.
export type AgentEngineDeps = {
  supabase?: SupabaseClient;
  openai?: OpenAI;
  model?: string;
  tools?: AgentTool[];
  maxToolIterations?: number;
  // C7 -- overrides UNGROUNDED_FALLBACK_TEXT, the one hard-coded customer-
  // facing string in the pipeline (see constants.ts for why it exists and why
  // a caller may want to localise it).
  ungroundedFallbackText?: string;
};
