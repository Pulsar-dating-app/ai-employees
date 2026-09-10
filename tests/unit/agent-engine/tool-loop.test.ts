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

function textResponse(text: string, messageId = "msg_1") {
  return { output: [{ type: "message", id: messageId }], output_text: text };
}

function jsonReplyResponse(message: string, productIds: string[], messageId = "msg_1") {
  return {
    output: [{ type: "message", id: messageId }],
    output_text: JSON.stringify({ message, product_ids: productIds }),
  };
}

function functionCallResponse(callId: string, name: string, args: Record<string, unknown>) {
  return {
    output: [{ type: "function_call", call_id: callId, name, arguments: JSON.stringify(args) }],
    output_text: "",
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
