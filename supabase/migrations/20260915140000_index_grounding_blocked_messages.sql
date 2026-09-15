create index messages_grounding_blocked_idx
  on public.messages (company_id, conversation_id, created_at desc)
  where metadata -> 'grounding' ->> 'status' = 'blocked';

comment on index public.messages_grounding_blocked_idx is
  'Partial index over replies the C7 grounding check blocked outright. Those replies send the UNGROUNDED_FALLBACK_TEXT promise ("let me confirm and get back to you"), so the Conversations inbox lists them as unconfirmed promises a merchant still owes a customer. Partial because a blocked reply is rare by design -- the index stays tiny while the lookup stays constant-time.';
