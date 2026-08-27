import type OpenAI from "openai";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AgentTool } from "./tools/types";

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

export type AgentEngineResult = {
  responseText: string;
  conversationId: string;
  openAiConversationId: string;
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
};
