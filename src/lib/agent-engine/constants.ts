// No `model` column exists anywhere in the schema (agents/company_agents),
// so the model name is env-var/constant config, not DB-driven. This exact
// id was smoke-tested against a real key during C1's setup.
export const DEFAULT_MODEL = process.env.OPENAI_MODEL ?? "gpt-5.4-mini";

// Caps the step 8/9 call-tool-call-again loop so a misbehaving model (or a
// bug in a future tool) can't run up API cost indefinitely. A library
// shouldn't silently degrade past this -- see ToolLoopLimitExceededError.
export const DEFAULT_MAX_TOOL_ITERATIONS = 4;
