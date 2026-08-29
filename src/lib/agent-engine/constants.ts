// No `model` column exists anywhere in the schema (agents/company_agents),
// so the model name is env-var/constant config, not DB-driven. This exact
// id was smoke-tested against a real key during C1's setup.
export const DEFAULT_MODEL = process.env.OPENAI_MODEL ?? "gpt-5.4-mini";

// Caps the step 8/9 call-tool-call-again loop so a misbehaving model (or a
// bug in a future tool) can't run up API cost indefinitely. A library
// shouldn't silently degrade past this -- see ToolLoopLimitExceededError.
export const DEFAULT_MAX_TOOL_ITERATIONS = 4;

// Trello C7's last-resort text, sent only when a regenerated reply *also*
// fails the grounding check -- the card's "fall back to an honest 'let me
// check that' instead of guessing".
//
// Known limitation: this is the one string in the pipeline that can't honour
// LANGUAGE_GUARDRAIL, because at this point there's no model turn left to
// write it and nothing in the engine detects the customer's language.
// Portuguese is the MVP's launch language (spec §19, WhatsApp Brazil);
// `deps.ungroundedFallbackText` is the seam for D2 to localise it once real
// routing knows who it's talking to.
export const UNGROUNDED_FALLBACK_TEXT =
  "Deixa eu confirmar essa informação certinho pra não te passar nada errado, e já te falo 😊 " +
  "Enquanto isso, posso te ajudar com mais alguma coisa?";
