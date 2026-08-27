import type { SupabaseClient } from "@supabase/supabase-js";
import type OpenAI from "openai";

// Passed to every tool's execute() by the loop, never derived from the
// model-supplied arguments -- this is the load-bearing security rule
// (mirrors B5 ProductRepository's file comment): a tool must always trust
// ctx.companyId, never a companyId a caller could smuggle into `args`.
export type ToolExecutionContext = {
  companyId: string;
  conversationId: string;
  customerId: string;
  supabase: SupabaseClient;
};

// The tool-call contract this whole ticket exists to define. `parameters`
// is a JSON Schema object, matching OpenAI's FunctionTool.parameters
// exactly so toOpenAiTool is a near-identity mapping. execute() receives
// raw model-supplied JSON args (untyped, same as the wire format) -- a
// heterogeneous array of tools can't share a narrower type here, so each
// tool casts to its own args shape internally; validating args against
// `parameters` at runtime isn't in scope for this ticket.
export type AgentTool = {
  name: string;
  description: string;
  parameters: Record<string, unknown> | null;
  strict?: boolean;
  execute: (args: Record<string, unknown>, ctx: ToolExecutionContext) => Promise<unknown>;
};

export function toOpenAiTool(tool: AgentTool): OpenAI.Responses.FunctionTool {
  return {
    type: "function",
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters,
    // Strict mode requires every schema to set additionalProperties: false
    // and list every key (including optional ones) in `required`. Defaulting
    // to false here avoids silently rejecting a tool whose schema wasn't
    // authored to that stricter shape -- opt in per-tool once it is.
    strict: tool.strict ?? false,
  };
}
