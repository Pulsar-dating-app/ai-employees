-- Trello M1 -- first value added to conversation_channel since it was
-- created with just 'whatsapp' (see 20260823205345). Standalone-chat and
-- embedded-widget entry points share this one value -- they're the same
-- underlying channel, just two ways to reach it.
alter type public.conversation_channel add value 'web_chat';
