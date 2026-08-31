-- Trello N1 -- how an Instagram customer is identified. There is no phone
-- number on this channel; the inbound webhook (N4) carries an IGSID
-- (Instagram-scoped user id), which is what find-or-create keys on. It is
-- not the @handle and it is scoped to our app, so it is meaningless to
-- anyone else and safe to store as plain metadata.
--
-- Nullable, like M1's web_chat_session_id: WhatsApp and web-chat customers
-- never set it.
alter table public.customers
  add column instagram_user_id varchar;

-- Scoped to the company rather than globally unique, which is where this
-- deliberately differs from web_chat_session_id. That one is a secret we
-- generate, so global uniqueness is both true and useful. An IGSID is
-- issued by Meta per Instagram professional account, so the same person
-- messaging two different merchants on this platform can legitimately
-- produce two rows -- and a customer row belongs to one company anyway.
--
-- Partial, so the existing WhatsApp/web-chat rows (all NULL here) don't
-- collide with each other. Postgres treats NULLs as distinct in a plain
-- unique index, so this is belt-and-braces, but it also keeps the index
-- small and says what it means.
create unique index customers_company_instagram_user_id_idx
  on public.customers (company_id, instagram_user_id)
  where instagram_user_id is not null;
