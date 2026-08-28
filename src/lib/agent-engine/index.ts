import { createServiceClient } from "@/lib/supabase/service";
import { createOpenAIClient } from "@/lib/openai/client";
import type { AgentEngineDeps, AgentEngineInput, AgentEngineResult } from "./types";
import { DEFAULT_MAX_TOOL_ITERATIONS, DEFAULT_MODEL } from "./constants";
import { loadConversation, resolveOpenAiConversationId } from "./conversation";
import { loadAgentConfig } from "./config";
import { loadCustomer } from "./customer";
import { loadBusinessKnowledge } from "./knowledge";
import { determineIntent, validateResponse } from "./stubs";
import { buildInitialInput, buildSystemPrompt } from "./prompt";
import { runToolLoop } from "./tool-loop";
import { defaultTools } from "./tools/registry";

// Trello ticket C1 -- the orchestration shell from spec §17. This is the
// piece that turns "an LLM call" into "Malu": every step below is numbered
// to match the spec/card 1:1. There is no real caller yet (D2, the WhatsApp
// inbound webhook, isn't built) -- this is a plain importable function, not
// shaped around any specific webhook payload.
async function run(input: AgentEngineInput, deps: AgentEngineDeps = {}): Promise<AgentEngineResult> {
  const supabase = deps.supabase ?? createServiceClient();
  const openai = deps.openai ?? createOpenAIClient();
  const model = deps.model ?? DEFAULT_MODEL;
  const tools = deps.tools ?? defaultTools;
  const maxToolIterations = deps.maxToolIterations ?? DEFAULT_MAX_TOOL_ITERATIONS;

  // Step 1 (conversation half) -- everything else in this pipeline is
  // scoped off of the conversation row, so it's resolved first and its
  // company_id is the source of truth `input.companyId` is checked against.
  const conversation = await loadConversation(supabase, {
    conversationId: input.conversationId,
    companyId: input.companyId,
  });

  // Steps 1/3/4 -- independent reads once the conversation is known.
  // `customer` is loaded (step 3) but not yet threaded into the
  // prompt/tools -- nothing in the 11 steps says what to do with it beyond
  // "load customer context," and inventing a shape (e.g. "greet by name")
  // isn't this ticket's call to make. Available for the next ticket that
  // needs it.
  const [agentConfig, , knowledge] = await Promise.all([
    loadAgentConfig(supabase, { companyId: input.companyId, agentId: conversation.agent_id! }),
    loadCustomer(supabase, { companyId: input.companyId, customerId: conversation.customer_id }),
    loadBusinessKnowledge(supabase, input.companyId),
  ]);

  // Step 2
  const openAiConversationId = await resolveOpenAiConversationId(openai, supabase, conversation);

  // Step 6
  const intent = determineIntent(input.message);

  // Step 7
  const instructions = buildSystemPrompt({ agentConfig, knowledge, intent });
  const initialInput = buildInitialInput(input.message);

  // Steps 8+9
  const rawResponseText = await runToolLoop({
    openai,
    model,
    openAiConversationId,
    instructions,
    initialInput,
    tools,
    maxToolIterations,
    toolCtx: {
      companyId: input.companyId,
      // Non-null: loadConversation throws ConversationAgentMissingError
      // otherwise. Tools that write an event row (C4's checkout link, and
      // C5's request_human next) need it to attribute the row to an agent.
      agentId: conversation.agent_id!,
      conversationId: conversation.id,
      customerId: conversation.customer_id,
      supabase,
    },
  });

  // Step 10
  const responseText = validateResponse(rawResponseText);

  // Step 11
  return { responseText, conversationId: conversation.id, openAiConversationId };
}

export const AgentEngine = { run };
export type { AgentEngineInput, AgentEngineResult, AgentEngineDeps } from "./types";
