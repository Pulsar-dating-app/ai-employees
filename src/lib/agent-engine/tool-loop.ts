import type OpenAI from "openai";
import type { ResponseFunctionToolCall, ResponseInput } from "openai/resources/responses/responses";
import { toOpenAiTool, type AgentTool, type ToolExecutionContext } from "./tools/types";
import { ToolLoopLimitExceededError, UnknownToolCallError } from "./errors";

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
}): Promise<string> {
  const toolsByName = new Map(tools.map((tool) => [tool.name, tool]));
  const openAiTools = tools.map(toOpenAiTool);

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

    if (functionCalls.length === 0) return response.output_text;

    input = await Promise.all(
      functionCalls.map(async (call) => {
        const tool = toolsByName.get(call.name);
        if (!tool) throw new UnknownToolCallError(call.name);

        const args = JSON.parse(call.arguments);
        const result = await tool.execute(args, toolCtx);

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
