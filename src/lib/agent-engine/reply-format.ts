// The structured shape every agent turn's final answer takes.
//
// The model emits `{ message, product_ids }` instead of free text so that
// *which products it wants shown as cards* is explicit data it chose, not
// something downstream code has to infer by matching catalog names against
// the prose. Inference could never tell "recommend the Complete" from
// "the Liquid is the blue one, so not that" -- both name a product. The
// model can. See decisions.md (2026-09-10).
//
// `product_ids` is `[]` on every channel/agent that doesn't render cards
// (WhatsApp, Ana) -- the base prompt says so, and `selectProductCards`
// treats an empty list as "no cards", full stop.
//
// Passed as the Responses API `text.format` on every tool-loop turn: a
// turn that calls tools just produces `function_call` items and no text
// (the format constraint on text is vacuously met); the turn that answers
// produces one JSON message conforming to this schema. It stays a normal
// `message` output item, so C7's ungrounded-draft discard is unaffected.
export const AGENT_REPLY_FORMAT = {
  type: "json_schema" as const,
  name: "agent_reply",
  strict: true,
  schema: {
    type: "object" as const,
    additionalProperties: false,
    properties: {
      message: {
        type: "string" as const,
        description:
          "The text the customer sees. Follows every rule in the system prompt (plain text, " +
          "no markdown, the conversation's language, grounding, scope). The JSON is only the " +
          "envelope -- it is never shown to the customer.",
      },
      product_ids: {
        type: "array" as const,
        items: { type: "string" as const },
        description:
          "Ids of the products to show as visual cards under the message, in display order. " +
          "Empty array unless this turn is recommending specific products on a surface that " +
          "renders cards -- see the product-card guidance if the system prompt includes it.",
      },
    },
    required: ["message", "product_ids"],
  },
};

export type ParsedAgentReply = { message: string; productIds: string[] };

// Defensive on purpose. The model can ignore the format (an older model, a
// transient error), and every unit/integration fake returns a plain string.
// Anything that isn't a JSON object with a string `message` falls back to
// `null` -- the caller then treats the raw output as the message with no
// explicit card choice, and card selection drops to its legacy name-match
// path.
export function parseAgentReply(outputText: string | null | undefined): ParsedAgentReply | null {
  const trimmed = outputText?.trim();
  if (!trimmed || trimmed[0] !== "{") return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;

  const obj = parsed as Record<string, unknown>;
  if (typeof obj.message !== "string") return null;

  const productIds = Array.isArray(obj.product_ids)
    ? [...new Set(obj.product_ids.filter((id): id is string => typeof id === "string" && id.length > 0))]
    : [];

  return { message: obj.message, productIds };
}
