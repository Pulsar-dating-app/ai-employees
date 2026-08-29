import type OpenAI from "openai";
import type { ResponseFunctionToolCall, ResponseInput } from "openai/resources/responses/responses";
import { toOpenAiTool, type AgentTool, type ToolExecutionContext } from "./tools/types";
import { ToolLoopLimitExceededError, UnknownToolCallError } from "./errors";

// What each tool actually returned this turn. Kept (rather than discarded
// after being handed back to the model) because C7's step-10 grounding check
// needs the real retrieved facts to validate the final response against --
// see grounding.ts.
// `args` is what the MODEL chose to search for -- the single most useful
// thing to see when a search behaves oddly, and invisible everywhere else:
// it travels in the RPC's POST body, which Supabase's edge logs don't
// capture, and Postgres doesn't log function parameters by default.
export type ToolCallRecord = { name: string; args: Record<string, unknown>; result: unknown };

export type ToolLoopResult = {
  responseText: string;
  toolResults: ToolCallRecord[];
  // Ids of the assistant message items the final call produced. C7 deletes
  // these from the OpenAI conversation when a response fails the grounding
  // check, so an invented figure can't be read back as something Malu already
  // said on the next turn.
  messageItemIds: string[];
};

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
  let input: ResponseInput = initialInput;

  for (let iteration = 0; iteration < maxToolIterations; iteration++) {
    const response = await openai.responses.create({
      conversation: openAiConversationId,
      instructions,
      input,
      tools: openAiTools,
      store: true,
      model,
    });

    const functionCalls = response.output.filter(
      (item): item is ResponseFunctionToolCall => item.type === "function_call",
    );

    if (functionCalls.length === 0) {
      return {
        responseText: response.output_text,
        toolResults,
        messageItemIds: response.output
          .filter((item) => item.type === "message")
          .map((item) => item.id)
          .filter((id): id is string => Boolean(id)),
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
