import type { SupabaseClient } from "@supabase/supabase-js";
import type OpenAI from "openai";
import {
  ConversationAgentMissingError,
  ConversationCompanyMismatchError,
  ConversationNotFoundError,
} from "./errors";

export type ConversationRow = {
  id: string;
  company_id: string;
  agent_id: string | null;
  customer_id: string;
  channel: string | null;
  open_ai_conversation_id: string | null;
  status: string | null;
};

// Step 1 (part) / step 2 setup -- there is no authenticated merchant session
// in this context (an inbound customer message isn't a logged-in dashboard
// user), so this goes through the service-role client and filters
// company_id explicitly in application code rather than relying on RLS,
// same as B5's ProductRepository.
export async function loadConversation(
  supabase: SupabaseClient,
  { conversationId, companyId }: { conversationId: string; companyId: string },
): Promise<ConversationRow> {
  const { data, error } = await supabase
    .from("conversations")
    .select("*")
    .eq("id", conversationId)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new ConversationNotFoundError(conversationId);
  if (data.company_id !== companyId) throw new ConversationCompanyMismatchError(conversationId);
  if (!data.agent_id) throw new ConversationAgentMissingError(conversationId);

  return data as ConversationRow;
}

// Step 2 -- the Responses API's `conversation` param carries prior-turn
// history server-side, so "load recent conversation history" really just
// means "resolve or create the id it lives under." Create-once-and-persist:
// a second call for the same conversation must reuse the stored id, never
// call conversations.create() again.
export async function resolveOpenAiConversationId(
  openai: OpenAI,
  supabase: SupabaseClient,
  conversation: ConversationRow,
): Promise<string> {
  if (conversation.open_ai_conversation_id) return conversation.open_ai_conversation_id;

  const created = await openai.conversations.create();

  const { error } = await supabase
    .from("conversations")
    .update({ open_ai_conversation_id: created.id })
    .eq("id", conversation.id);
  if (error) throw error;

  return created.id;
}

// Trello C7. Responses are created with `store: true` against a conversation
// id, so a draft the grounding check rejects is *already* part of the
// conversation's server-side history by the time we look at it -- and would
// be read back next turn as something Malu had said, letting a blocked
// invented price resurface as "como eu te falei, R$ 199". Removing the item
// is what keeps the block from leaking across turns.
//
// Best-effort by design: the customer has already been protected (the text
// isn't being sent either way), so a failed cleanup must not turn a
// successfully-blocked turn into a failed one.
export async function discardConversationItems(
  openai: OpenAI,
  openAiConversationId: string,
  itemIds: string[],
): Promise<void> {
  await Promise.all(
    itemIds.map(async (itemId) => {
      try {
        await openai.conversations.items.delete(itemId, { conversation_id: openAiConversationId });
      } catch {
        // Intentionally ignored -- see above.
      }
    }),
  );
}
