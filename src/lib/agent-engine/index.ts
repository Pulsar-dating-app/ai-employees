import { createServiceClient } from "@/lib/supabase/service";
import { createOpenAIClient } from "@/lib/openai/client";
import type { AgentEngineDeps, AgentEngineInput, AgentEngineResult } from "./types";
import { DEFAULT_MAX_TOOL_ITERATIONS, DEFAULT_MODEL, UNGROUNDED_FALLBACK_TEXT } from "./constants";
import { discardConversationItems, loadConversation, resolveOpenAiConversationId } from "./conversation";
import { loadAgentConfig } from "./config";
import { loadCustomer } from "./customer";
import { loadBusinessName, loadCompanyTimezone, loadHumanHandoffEnabled } from "./knowledge";
import { isValidTimeZone } from "@/lib/analytics/load";
import { determineIntent } from "./stubs";
import { buildInitialInput, buildSystemPrompt } from "./prompt";
import { buildGroundingCorrectionInput, checkResponseGrounding } from "./grounding";
import { runToolLoop } from "./tool-loop";
import { resolveToolsForAgent } from "./tools/tool-sets";

// A human-readable "weekday, month day, year (timezone)" string for the
// system prompt's temporal anchor -- resolved in the business's own
// timezone (falling back to UTC when it's unset or invalid) so "today" and
// the current weekday match what the merchant and customer actually
// experience. Locale is fixed to en-CA for a stable, unambiguous shape
// regardless of the Node build's locale data; the model localizes the
// phrasing itself when it replies (LANGUAGE_GUARDRAIL).
function formatCurrentDate(timezone: string | null, now: Date = new Date()): string {
  const tz = timezone && isValidTimeZone(timezone) ? timezone : "UTC";
  const formatted = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(now);
  return `${formatted} (${tz})`;
}

// Trello ticket C1 -- the orchestration shell from spec §17. This is the
// piece that turns "an LLM call" into "Malu": every step below is numbered
// to match the spec/card 1:1. There is no real caller yet (D2, the WhatsApp
// inbound webhook, isn't built) -- this is a plain importable function, not
// shaped around any specific webhook payload.
async function run(input: AgentEngineInput, deps: AgentEngineDeps = {}): Promise<AgentEngineResult> {
  const supabase = deps.supabase ?? createServiceClient();
  const openai = deps.openai ?? createOpenAIClient();
  const model = deps.model ?? DEFAULT_MODEL;
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
  const [agentConfig, , businessName, companyTimezone, humanHandoffEnabled] = await Promise.all([
    loadAgentConfig(supabase, { companyId: input.companyId, agentId: conversation.agent_id! }),
    loadCustomer(supabase, { companyId: input.companyId, customerId: conversation.customer_id }),
    loadBusinessName(supabase, input.companyId),
    loadCompanyTimezone(supabase, input.companyId),
    loadHumanHandoffEnabled(supabase, input.companyId),
  ]);

  // Trello J2 -- resolved here, not at the top of run(), because it depends
  // on which agent this conversation belongs to. deps.tools still overrides
  // everything (that's how tests drive the loop with fake single-purpose
  // tools), so an explicit list is never silently filtered by slug or by
  // this company setting -- an explicit deps.tools list means exactly what
  // it says.
  //
  // F5 follow-up -- request_human is stripped out entirely, not left in
  // with instructions not to use it: a tool the model can see is a tool it
  // will eventually reach for (the same reasoning J2 itself documents at
  // the top of tool-sets.ts), so "don't offer it" has to mean it's actually
  // absent from what's sent to the model, not a prompt-level suggestion.
  const tools =
    deps.tools ??
    resolveToolsForAgent(agentConfig.slug).filter((tool) => humanHandoffEnabled || tool.name !== "request_human");

  // Step 2
  const openAiConversationId = await resolveOpenAiConversationId(openai, supabase, conversation);

  // Step 6
  const intent = determineIntent(input.message);

  // Step 7
  const instructions = buildSystemPrompt({
    agentConfig,
    businessName,
    intent,
    currentDate: formatCurrentDate(companyTimezone),
  });
  const initialInput = buildInitialInput(input.message);

  const loopParams = {
    openai,
    model,
    openAiConversationId,
    instructions,
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
      openai,
    },
  };

  // Steps 8+9
  const draft = await runToolLoop({ ...loopParams, initialInput });

  // Step 10 (Trello C7) -- every price/stock figure in the reply has to be
  // traceable to something actually retrieved, or the reply doesn't go out.
  // See grounding.ts for what is and isn't deterministically checkable.
  const firstCheck = await checkResponseGrounding({
    responseText: draft.responseText,
    toolResults: draft.toolResults,
    customerMessage: input.message,
    supabase,
    companyId: input.companyId,
  });

  if (firstCheck.grounded) {
    // Step 11
    return {
      responseText: draft.responseText,
      conversationId: conversation.id,
      openAiConversationId,
      grounding: { status: "grounded", violations: [] },
      toolCalls: draft.toolResults,
    };
  }

  // Drop the rejected draft from the conversation *before* regenerating, so
  // the retry isn't anchored on its own invented figure (and so no later turn
  // can quote it back).
  await discardConversationItems(openai, openAiConversationId, draft.messageItemIds);

  const retry = await runToolLoop({
    ...loopParams,
    initialInput: buildGroundingCorrectionInput(firstCheck.violations),
  });

  const secondCheck = await checkResponseGrounding({
    responseText: retry.responseText,
    // Facts the first attempt retrieved are still facts this turn retrieved --
    // the retry shouldn't have to look them up again to be allowed to use them.
    toolResults: [...draft.toolResults, ...retry.toolResults],
    customerMessage: input.message,
    supabase,
    companyId: input.companyId,
  });

  if (secondCheck.grounded) {
    return {
      responseText: retry.responseText,
      conversationId: conversation.id,
      openAiConversationId,
      grounding: { status: "regenerated", violations: firstCheck.violations },
      toolCalls: [...draft.toolResults, ...retry.toolResults],
    };
  }

  await discardConversationItems(openai, openAiConversationId, retry.messageItemIds);

  return {
    responseText: deps.ungroundedFallbackText ?? UNGROUNDED_FALLBACK_TEXT,
    conversationId: conversation.id,
    openAiConversationId,
    grounding: { status: "blocked", violations: firstCheck.violations },
    toolCalls: [...draft.toolResults, ...retry.toolResults],
  };
}

export const AgentEngine = { run };
export type { AgentEngineInput, AgentEngineResult, AgentEngineDeps, GroundingOutcome } from "./types";
export type { GroundingClaim } from "./grounding";
