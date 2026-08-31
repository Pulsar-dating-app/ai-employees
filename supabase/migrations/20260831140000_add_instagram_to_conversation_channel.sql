-- Trello N1 -- third value on conversation_channel, after 'whatsapp' (the
-- original) and M1's 'web_chat'. Instagram DM replaces WhatsApp as the
-- messaging channel being built; see decisions.md 2026-08-31.
--
-- Alone in its own migration on purpose: Postgres won't let a newly added
-- enum value be *used* in the same transaction that adds it, so anything
-- referencing 'instagram' has to land in a later file. Same reason M1 split
-- 'web_chat' out (20260830193132).
alter type public.conversation_channel add value 'instagram';
