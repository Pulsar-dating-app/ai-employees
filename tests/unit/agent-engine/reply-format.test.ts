import { describe, expect, it } from "vitest";
import { AGENT_REPLY_FORMAT, parseAgentReply } from "@/lib/agent-engine/reply-format";

// The structured-reply contract (2026-09-10): every turn's final answer is
// `{ message, product_ids }` so the card choice is data the model chose,
// not something inferred from prose. `parseAgentReply` is the defensive
// reader -- anything that isn't a well-formed object falls back to null so
// the caller can treat the raw text as the message.

describe("AGENT_REPLY_FORMAT", () => {
  it("is a strict json_schema requiring both keys and no others", () => {
    expect(AGENT_REPLY_FORMAT.type).toBe("json_schema");
    expect(AGENT_REPLY_FORMAT.strict).toBe(true);
    expect(AGENT_REPLY_FORMAT.schema.additionalProperties).toBe(false);
    expect(AGENT_REPLY_FORMAT.schema.required).toEqual(["message", "product_ids"]);
    expect(AGENT_REPLY_FORMAT.schema.properties.product_ids.type).toBe("array");
  });
});

describe("parseAgentReply", () => {
  it("reads a well-formed structured reply", () => {
    const parsed = parseAgentReply('{"message":"Temos essas duas:","product_ids":["a","b"]}');
    expect(parsed).toEqual({ message: "Temos essas duas:", productIds: ["a", "b"] });
  });

  it("treats an empty product_ids array as a real choice to show nothing", () => {
    const parsed = parseAgentReply('{"message":"Não encontrei nada assim.","product_ids":[]}');
    expect(parsed).toEqual({ message: "Não encontrei nada assim.", productIds: [] });
  });

  it("de-duplicates and drops non-string / empty ids", () => {
    const parsed = parseAgentReply('{"message":"ok","product_ids":["a","a","",1,null,"b"]}');
    expect(parsed).toEqual({ message: "ok", productIds: ["a", "b"] });
  });

  it("defaults product_ids to [] when the key is missing or not an array", () => {
    expect(parseAgentReply('{"message":"oi"}')).toEqual({ message: "oi", productIds: [] });
    expect(parseAgentReply('{"message":"oi","product_ids":"a"}')).toEqual({ message: "oi", productIds: [] });
  });

  it.each([
    ["plain prose, not JSON", "Olá! Como posso ajudar?"],
    ["empty string", ""],
    ["whitespace only", "   "],
    ["malformed JSON", '{"message": "oi", '],
    ["JSON without a string message", '{"product_ids":["a"]}'],
    ["a JSON array, not an object", '["a","b"]'],
    ["a JSON string", '"just a string"'],
  ])("returns null for %s", (_label, input) => {
    expect(parseAgentReply(input)).toBeNull();
  });

  it("returns null for null / undefined input", () => {
    expect(parseAgentReply(null)).toBeNull();
    expect(parseAgentReply(undefined)).toBeNull();
  });
});
