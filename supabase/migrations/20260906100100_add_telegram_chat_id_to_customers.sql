-- Trello O1 -- how a Telegram customer is identified. The webhook (D2/N4's
-- Telegram sibling) carries `message.chat.id`, which is what find-or-create
-- keys on. Nullable, like `instagram_user_id`/`web_chat_session_id`: every
-- other channel's rows never set it.
alter table public.customers
  add column telegram_chat_id varchar;

-- Scoped to the company rather than globally unique, same reasoning as
-- `instagram_user_id`: the same person messaging our shared bot on behalf
-- of two different merchants (unlikely for Telegram's deep-link model, but
-- not impossible) legitimately produces two rows, and a customer row
-- belongs to one company anyway. Partial so existing WhatsApp/web-chat/
-- Instagram rows (all NULL here) don't collide with each other.
create unique index customers_company_telegram_chat_id_idx
  on public.customers (company_id, telegram_chat_id)
  where telegram_chat_id is not null;
