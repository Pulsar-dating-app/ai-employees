-- Trello N4 -- idempotency for the Instagram inbound webhook. Meta retries a
-- failed delivery repeatedly over 36 hours and does not guarantee it won't
-- also just resend a batch it already delivered; without a dedup key, a
-- retried webhook re-runs AgentEngine.run() and sends the customer a second
-- (possibly different, since the model isn't deterministic) reply to the
-- same message.
--
-- external_message_id holds Instagram's own message id (`mid`). The webhook
-- route inserts the customer's message with this set BEFORE calling the
-- Agent Engine; a unique-violation on that insert means this exact message
-- was already processed (by this call or a concurrent one) and the route
-- just acks 200 without doing anything else. The index itself is the
-- idempotency mechanism, not an in-memory or Redis-backed one.
--
-- Nullable and partial-unique, same shape as customers.web_chat_session_id:
-- WhatsApp (dormant) and web-chat rows never set it.
alter table public.messages
  add column external_message_id varchar;

create unique index messages_external_message_id_idx
  on public.messages (external_message_id)
  where external_message_id is not null;
