import OpenAI from "openai";

// Server-only -- OPENAI_API_KEY has no NEXT_PUBLIC_ prefix, so this must
// never be imported from client code. Used by the Agent Engine (Trello C1)
// for the Responses API (model calls) and the Conversations API
// (conversations.open_ai_conversation_id history).
export function createOpenAIClient() {
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
}
