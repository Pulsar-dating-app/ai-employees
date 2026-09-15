import { describe, expect, it, vi } from "vitest";
import { runToolLoop } from "@/lib/agent-engine/tool-loop";
import { ToolLoopLimitExceededError, UnknownToolCallError } from "@/lib/agent-engine/errors";
import type { AgentTool, ToolExecutionContext } from "@/lib/agent-engine/tools/types";

// Trello ticket C1 -- steps 8+9, the actual deliverable of this ticket.
// Fakes the OpenAI client entirely (no real HTTP/next-dev process involved,
// unlike D1's Graph API mock-server precedent -- this loop is called
// in-process, so dependency injection is the natural fake here).

function fakeToolCtx(): ToolExecutionContext {
  return {
    companyId: "company-1",
    agentId: "agent-1",
    conversationId: "conversation-1",
    customerId: "customer-1",
    // Not used by any of these fakes; present to satisfy the type.
    supabase: {} as ToolExecutionContext["supabase"],
    openai: {} as ToolExecutionContext["openai"],
  };
}

// Real ResponseUsage shape, minimal but structurally accurate -- exercises
// addUsage's actual field reads rather than relying on it silently no-op-ing
// on a fake with no `usage` at all (every other fake response in this file
// still omits it deliberately, to keep proving that path never breaks).
function fakeUsage(inputTokens: number, cachedTokens: number, outputTokens: number) {
  return {
    input_tokens: inputTokens,
    input_tokens_details: { cached_tokens: cachedTokens, cache_write_tokens: 0 },
    output_tokens: outputTokens,
    output_tokens_details: { reasoning_tokens: 0 },
    total_tokens: inputTokens + outputTokens,
  };
}

function textResponse(text: string, messageId = "msg_1", usage?: ReturnType<typeof fakeUsage>) {
  return { output: [{ type: "message", id: messageId }], output_text: text, usage };
}

function jsonReplyResponse(
  message: string,
  productIds: string[],
  messageId = "msg_1",
  usage?: ReturnType<typeof fakeUsage>,
) {
  return {
    output: [{ type: "message", id: messageId }],
    output_text: JSON.stringify({ message, product_ids: productIds }),
    usage,
  };
}

function functionCallResponse(
  callId: string,
  name: string,
  args: Record<string, unknown>,
  usage?: ReturnType<typeof fakeUsage>,
) {
  return {
    output: [{ type: "function_call", call_id: callId, name, arguments: JSON.stringify(args) }],
    output_text: "",
    usage,
  };
}

describe("runToolLoop", () => {
  it("parses a structured JSON reply into responseText and displayProductIds", async () => {
    const create = vi.fn().mockResolvedValueOnce(jsonReplyResponse("Temos essas:", ["p1", "p2"]));
    const openai = { responses: { create } } as never;

    const result = await runToolLoop({
      openai,
      model: "test-model",
      openAiConversationId: "conv_abc",
      instructions: "be helpful",
      initialInput: [{ role: "user", content: "hi" }],
      tools: [],
      maxToolIterations: 4,
      toolCtx: fakeToolCtx(),
    });

    expect(result.responseText).toBe("Temos essas:");
    expect(result.displayProductIds).toEqual(["p1", "p2"]);
    expect(result.messageItemIds).toEqual(["msg_1"]);
    // The model is always asked for the { message, product_ids } shape.
    expect(create.mock.calls[0][0].text).toEqual({ format: expect.objectContaining({ name: "agent_reply" }) });
  });

  it("falls back to raw output_text with null displayProductIds when the reply isn't structured JSON", async () => {
    const create = vi.fn().mockResolvedValueOnce(textResponse("Hello there!"));
    const openai = { responses: { create } } as never;

    const result = await runToolLoop({
      openai,
      model: "test-model",
      openAiConversationId: "conv_abc",
      instructions: "be helpful",
      initialInput: [{ role: "user", content: "hi" }],
      tools: [],
      maxToolIterations: 4,
      toolCtx: fakeToolCtx(),
    });

    expect(result.responseText).toBe("Hello there!");
    // null (not []) tells card selection to fall back to name-matching.
    expect(result.displayProductIds).toBeNull();
    expect(result.toolResults).toEqual([]);
    // C7 needs these ids to be able to delete an ungrounded draft from the
    // conversation.
    expect(result.messageItemIds).toEqual(["msg_1"]);
    expect(create).toHaveBeenCalledTimes(1);
    // This fake carries no `usage` at all -- addUsage must degrade to zeros
    // rather than throw, the same real-world case a network hiccup or an
    // API version drift could produce.
    expect(result.usage).toEqual({
      inputTokens: 0,
      cachedInputTokens: 0,
      cacheWriteTokens: 0,
      outputTokens: 0,
      reasoningTokens: 0,
      totalTokens: 0,
      calls: 0,
    });
  });

  it("returns the real per-call usage from the response", async () => {
    const create = vi
      .fn()
      .mockResolvedValueOnce(jsonReplyResponse("Temos essas:", ["p1"], "msg_1", fakeUsage(500, 300, 40)));
    const openai = { responses: { create } } as never;

    const result = await runToolLoop({
      openai,
      model: "test-model",
      openAiConversationId: "conv_abc",
      instructions: "be helpful",
      initialInput: [{ role: "user", content: "hi" }],
      tools: [],
      maxToolIterations: 4,
      toolCtx: fakeToolCtx(),
    });

    expect(result.usage).toEqual({
      inputTokens: 500,
      cachedInputTokens: 300,
      cacheWriteTokens: 0,
      outputTokens: 40,
      reasoningTokens: 0,
      totalTokens: 540,
      calls: 1,
    });
  });

  it("sums usage across a tool-call round trip, not just the final call", async () => {
    const tool: AgentTool = {
      name: "do_thing",
      description: "does a thing",
      parameters: null,
      execute: vi.fn().mockResolvedValue({ ok: true }),
    };

    const create = vi
      .fn()
      .mockResolvedValueOnce(
        functionCallResponse("call_1", "do_thing", { foo: "bar" }, fakeUsage(1000, 200, 15)),
      )
      .mockResolvedValueOnce(textResponse("Done!", "msg_1", fakeUsage(1400, 900, 25)));
    const openai = { responses: { create } } as never;

    const result = await runToolLoop({
      openai,
      model: "test-model",
      openAiConversationId: "conv_abc",
      instructions: "be helpful",
      initialInput: [{ role: "user", content: "do the thing" }],
      tools: [tool],
      maxToolIterations: 4,
      toolCtx: fakeToolCtx(),
    });

    // Both calls' tokens summed -- the second call's larger input reflects
    // the first call's own prompt plus the tool's output being replayed
    // back, which is real cost this customer message caused, not just
    // whichever single call happened to answer.
    expect(result.usage).toEqual({
      inputTokens: 2400,
      cachedInputTokens: 1100,
      cacheWriteTokens: 0,
      outputTokens: 40,
      reasoningTokens: 0,
      totalTokens: 2440,
      calls: 2,
    });
  });

  it("executes a matching tool and resubmits its output, then returns the final text", async () => {
    const execute = vi.fn().mockResolvedValue({ ok: true });
    const tool: AgentTool = {
      name: "do_thing",
      description: "does a thing",
      parameters: null,
      execute,
    };

    const create = vi
      .fn()
      .mockResolvedValueOnce(functionCallResponse("call_1", "do_thing", { foo: "bar" }))
      .mockResolvedValueOnce(textResponse("Done!"));
    const openai = { responses: { create } } as never;

    const result = await runToolLoop({
      openai,
      model: "test-model",
      openAiConversationId: "conv_abc",
      instructions: "be helpful",
      initialInput: [{ role: "user", content: "do the thing" }],
      tools: [tool],
      maxToolIterations: 4,
      toolCtx: fakeToolCtx(),
    });

    expect(result.responseText).toBe("Done!");
    // Recorded, not just forwarded to the model -- C7's grounding check
    // validates the final text against exactly these results.
    expect(result.toolResults).toEqual([{ name: "do_thing", args: { foo: "bar" }, result: { ok: true } }]);
    expect(execute).toHaveBeenCalledWith({ foo: "bar" }, expect.objectContaining({ companyId: "company-1" }));

    const secondCallArgs = create.mock.calls[1][0];
    expect(secondCallArgs.input).toEqual([
      { type: "function_call_output", call_id: "call_1", output: JSON.stringify({ ok: true }) },
    ]);
  });

  it("throws UnknownToolCallError when the model requests an unregistered tool", async () => {
    const create = vi.fn().mockResolvedValueOnce(functionCallResponse("call_1", "not_registered", {}));
    const openai = { responses: { create } } as never;

    await expect(
      runToolLoop({
        openai,
        model: "test-model",
        openAiConversationId: "conv_abc",
        instructions: "be helpful",
        initialInput: [{ role: "user", content: "hi" }],
        tools: [],
        maxToolIterations: 4,
        toolCtx: fakeToolCtx(),
      }),
    ).rejects.toBeInstanceOf(UnknownToolCallError);
  });

  it("retries without text.format when the model rejects it, and parses the fallback text", async () => {
    // Fresh module so the process-lifetime `structuredRepliesSupported` flag
    // starts true and isn't carried in from another test.
    vi.resetModules();
    const { runToolLoop: freshRunToolLoop } = await import("@/lib/agent-engine/tool-loop");

    const create = vi
      .fn()
      .mockRejectedValueOnce({ status: 400, message: "Unknown parameter: 'text.format'." })
      .mockResolvedValueOnce(textResponse("Oi! Como ajudo?"));
    const openai = { responses: { create } } as never;

    const result = await freshRunToolLoop({
      openai,
      model: "test-model",
      openAiConversationId: "conv_abc",
      instructions: "be helpful",
      initialInput: [{ role: "user", content: "hi" }],
      tools: [],
      maxToolIterations: 4,
      toolCtx: fakeToolCtx(),
    });

    expect(result.responseText).toBe("Oi! Como ajudo?");
    expect(result.displayProductIds).toBeNull();
    // First attempt carried the format; the retry did not.
    expect(create.mock.calls[0][0].text).toEqual({ format: expect.objectContaining({ name: "agent_reply" }) });
    expect(create.mock.calls[1][0].text).toBeUndefined();
    expect(create).toHaveBeenCalledTimes(2);
  });

  it("does not swallow an unrelated model error as a format rejection", async () => {
    vi.resetModules();
    const { runToolLoop: freshRunToolLoop } = await import("@/lib/agent-engine/tool-loop");

    const create = vi.fn().mockRejectedValueOnce({ status: 500, message: "internal error" });
    const openai = { responses: { create } } as never;

    await expect(
      freshRunToolLoop({
        openai,
        model: "test-model",
        openAiConversationId: "conv_abc",
        instructions: "be helpful",
        initialInput: [{ role: "user", content: "hi" }],
        tools: [],
        maxToolIterations: 4,
        toolCtx: fakeToolCtx(),
      }),
    ).rejects.toMatchObject({ status: 500 });
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("throws ToolLoopLimitExceededError after exactly maxToolIterations calls that never resolve", async () => {
    const tool: AgentTool = {
      name: "loop_forever",
      description: "always asks to be called again",
      parameters: null,
      execute: vi.fn().mockResolvedValue("more"),
    };

    const create = vi.fn().mockResolvedValue(functionCallResponse("call_x", "loop_forever", {}));
    const openai = { responses: { create } } as never;

    await expect(
      runToolLoop({
        openai,
        model: "test-model",
        openAiConversationId: "conv_abc",
        instructions: "be helpful",
        initialInput: [{ role: "user", content: "hi" }],
        tools: [tool],
        maxToolIterations: 3,
        toolCtx: fakeToolCtx(),
      }),
    ).rejects.toBeInstanceOf(ToolLoopLimitExceededError);

    expect(create).toHaveBeenCalledTimes(3);
  });
});
