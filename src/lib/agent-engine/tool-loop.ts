import type OpenAI from "openai";
import type { ResponseFunctionToolCall, ResponseInput } from "openai/resources/responses/responses";
import { toOpenAiTool, type AgentTool, type ToolExecutionContext } from "./tools/types";
import { ToolLoopLimitExceededError, UnknownToolCallError } from "./errors";
import { AGENT_REPLY_FORMAT, parseAgentReply } from "./reply-format";

// What each tool actually returned this turn. Kept (rather than discarded
// after being handed back to the model) because C7's step-10 grounding check
// needs the real retrieved facts to validate the final response against --
// see grounding.ts.
// `args` is what the MODEL chose to search for -- the single most useful
// thing to see when a search behaves oddly, and invisible everywhere else:
// it travels in the RPC's POST body, which Supabase's edge logs don't
// capture, and Postgres doesn't log function parameters by default.
export type ToolCallRecord = { name: string; args: Record<string, unknown>; result: unknown };

// Real per-reply cost, straight from the API response rather than estimated
// -- see decisions.md. `calls` is how many openai.responses.create() round
// trips contributed to this number: a plain answer is 1, one tool call
// (search then answer) is at least 2, and a text.format rejection (see
// isUnsupportedFormatError below) adds one more for the retry.
export type ReplyUsage = {
  inputTokens: number;
  cachedInputTokens: number;
  cacheWriteTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  totalTokens: number;
  calls: number;
};

function emptyUsage(): ReplyUsage {
  return { inputTokens: 0, cachedInputTokens: 0, cacheWriteTokens: 0, outputTokens: 0, reasoningTokens: 0, totalTokens: 0, calls: 0 };
}

// Accumulates in place. `response.usage` is optional in the SDK's own types
// (and absent on the plain-object responses several in-process test fakes
// return), so a missing one just contributes nothing rather than breaking
// the loop -- usage tracking must never be able to fail a real customer
// turn over it.
function addUsage(usage: ReplyUsage, responseUsage: OpenAI.Responses.ResponseUsage | undefined | null): void {
  if (!responseUsage) return;
  usage.inputTokens += responseUsage.input_tokens ?? 0;
  usage.cachedInputTokens += responseUsage.input_tokens_details?.cached_tokens ?? 0;
  usage.cacheWriteTokens += responseUsage.input_tokens_details?.cache_write_tokens ?? 0;
  usage.outputTokens += responseUsage.output_tokens ?? 0;
  usage.reasoningTokens += responseUsage.output_tokens_details?.reasoning_tokens ?? 0;
  usage.totalTokens += responseUsage.total_tokens ?? 0;
  usage.calls += 1;
}

// Combines two runs' usage -- the grounding retry path (index.ts) needs
// draft + retry summed, since a customer message that triggered a retry
// genuinely cost both calls, not just the one that was actually sent.
export function sumUsage(a: ReplyUsage, b: ReplyUsage): ReplyUsage {
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    cachedInputTokens: a.cachedInputTokens + b.cachedInputTokens,
    cacheWriteTokens: a.cacheWriteTokens + b.cacheWriteTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    reasoningTokens: a.reasoningTokens + b.reasoningTokens,
    totalTokens: a.totalTokens + b.totalTokens,
    calls: a.calls + b.calls,
  };
}

export type ToolLoopResult = {
  responseText: string;
  // The product ids the model put in its structured reply's `product_ids`
  // -- an explicit, ordered choice of which searched products to card.
  // `null` (not `[]`) means the model didn't produce a parseable structured
  // reply at all (older model, an error, or a test fake returning a plain
  // string); card selection then falls back to matching catalog names in
  // `responseText`. `[]` means the model chose to show nothing.
  displayProductIds: string[] | null;
  toolResults: ToolCallRecord[];
  // Ids of the assistant message items the final call produced. C7 deletes
  // these from the OpenAI conversation when a response fails the grounding
  // check, so an invented figure can't be read back as something Malu already
  // said on the next turn.
  messageItemIds: string[];
  // Summed across every openai.responses.create() call this loop made --
  // see ReplyUsage.
  usage: ReplyUsage;
};

// Flips to false, for the life of the process, the first time the model
// rejects `text.format` (not every model supports structured outputs
// alongside function tools). After that every turn runs unformatted and the
// `{ message, product_ids }` contract rides on `REPLY_CONTRACT_GUARDRAIL` +
// `parseAgentReply`'s defensive read alone -- best-effort, never a 502. See
// decisions.md (2026-09-10).
let structuredRepliesSupported = true;

// Narrow test for "the model/endpoint doesn't accept text.format", so an
// unrelated failure (network, auth, rate limit) still propagates and isn't
// silently retried into the same wall.
function isUnsupportedFormatError(err: unknown): boolean {
  const status = (err as { status?: number })?.status;
  if (status !== 400 && status !== 404 && status !== 422) return false;
  const message = String((err as { message?: unknown })?.message ?? "").toLowerCase();
  return (
    message.includes("text.format") ||
    message.includes("response_format") ||
    message.includes("json_schema") ||
    message.includes("structured output") ||
    message.includes("format")
  );
}

// Steps 8+9 -- call the model, and if it asks to run tools, execute them
// and resubmit their output, repeating until it returns a final answer or
// maxToolIterations is hit. The `conversation` id already carries prior
// turns (and this loop's own intermediate turns) server-side, so `input`
// only ever needs the *newest* items, never a manually-replayed history.
export async function runToolLoop({
  openai,
  model,
  openAiConversationId,
  instructions,
  initialInput,
  tools,
  maxToolIterations,
  toolCtx,
}: {
  openai: OpenAI;
  model: string;
  openAiConversationId: string;
  instructions: string;
  initialInput: ResponseInput;
  tools: AgentTool[];
  maxToolIterations: number;
  toolCtx: ToolExecutionContext;
}): Promise<ToolLoopResult> {
  const toolsByName = new Map(tools.map((tool) => [tool.name, tool]));
  const openAiTools = tools.map(toOpenAiTool);

  const toolResults: ToolCallRecord[] = [];
  const usage = emptyUsage();
  let input: ResponseInput = initialInput;

  // `text.format` asks for the `{ message, product_ids }` shape (see
  // reply-format.ts). A tool-calling turn just emits function_call items and
  // no text, so it only bites on the turn that answers. Retried once without
  // it if the model rejects it, then skipped for the rest of the process.
  const callModel = (withFormat: boolean) =>
    openai.responses.create({
      conversation: openAiConversationId,
      instructions,
      input,
      tools: openAiTools,
      ...(withFormat ? { text: { format: AGENT_REPLY_FORMAT } } : {}),
      store: true,
      model,
    });

  for (let iteration = 0; iteration < maxToolIterations; iteration++) {
    let response;
    if (structuredRepliesSupported) {
      try {
        response = await callModel(true);
      } catch (err) {
        if (!isUnsupportedFormatError(err)) throw err;
        structuredRepliesSupported = false;
        console.warn(
          "[agent-engine] the model rejected `text.format`; falling back to unstructured replies " +
            "for the rest of this process (the { message, product_ids } contract now rides on the " +
            "prompt + defensive parser only)",
          err instanceof Error ? err.message : err,
        );
        response = await callModel(false);
      }
    } else {
      response = await callModel(false);
    }

    addUsage(usage, response.usage);

    const functionCalls = response.output.filter(
      (item): item is ResponseFunctionToolCall => item.type === "function_call",
    );

    if (functionCalls.length === 0) {
      const parsed = parseAgentReply(response.output_text);
      return {
        responseText: parsed ? parsed.message : response.output_text,
        displayProductIds: parsed ? parsed.productIds : null,
        toolResults,
        messageItemIds: response.output
          .filter((item) => item.type === "message")
          .map((item) => item.id)
          .filter((id): id is string => Boolean(id)),
        usage,
      };
    }

    input = await Promise.all(
      functionCalls.map(async (call) => {
        const tool = toolsByName.get(call.name);
        if (!tool) throw new UnknownToolCallError(call.name);

        const args = JSON.parse(call.arguments);
        const result = await tool.execute(args, toolCtx);
        toolResults.push({ name: call.name, args, result });

        return {
          type: "function_call_output" as const,
          call_id: call.call_id,
          output: JSON.stringify(result),
        };
      }),
    );
  }

  throw new ToolLoopLimitExceededError(maxToolIterations);
}
