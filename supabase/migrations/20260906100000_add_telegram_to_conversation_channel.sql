-- Trello O1 -- fourth value on conversation_channel, after 'whatsapp',
-- 'web_chat', and 'instagram'.
--
-- Alone in its own migration on purpose: Postgres won't let a newly added
-- enum value be *used* in the same transaction that adds it, same reason
-- 'instagram'/'web_chat' each got their own file.
alter type public.conversation_channel add value 'telegram';
