// Typed errors so a future caller (D2's webhook) can distinguish "this
// conversation/agent isn't in a runnable state" from a generic 500, the same
// way B1/B3's routes turn a missing row into a specific status code instead
// of a raw Postgres error.
export class AgentEngineError extends Error {}

export class ConversationNotFoundError extends AgentEngineError {
  constructor(conversationId: string) {
    super(`Conversation not found: ${conversationId}`);
  }
}

export class ConversationCompanyMismatchError extends AgentEngineError {
  constructor(conversationId: string) {
    super(`Conversation ${conversationId} does not belong to the given company`);
  }
}

export class ConversationAgentMissingError extends AgentEngineError {
  constructor(conversationId: string) {
    super(`Conversation ${conversationId} has no agent assigned`);
  }
}

export class AgentUnavailableError extends AgentEngineError {
  constructor(reason: string) {
    super(`Agent unavailable: ${reason}`);
  }
}

export class UnknownToolCallError extends AgentEngineError {
  constructor(toolName: string) {
    super(`Model requested an unregistered tool: ${toolName}`);
  }
}

export class ToolLoopLimitExceededError extends AgentEngineError {
  constructor(maxIterations: number) {
    super(`Tool-call loop exceeded ${maxIterations} iterations without a final response`);
  }
}
