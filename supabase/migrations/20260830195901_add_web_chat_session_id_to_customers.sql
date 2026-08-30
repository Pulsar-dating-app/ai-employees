-- Trello M3 -- lets the public chat API find-or-create a customer by an
-- opaque, client-generated session id (crypto.randomUUID(), stored in the
-- visitor's own localStorage -- never a cookie, see decisions.md). Nullable
-- and unique: WhatsApp customers never set it. No format CHECK at the DB
-- level, same precedent as events.tracking_id -- validated at the route
-- layer instead.
alter table public.customers
  add column web_chat_session_id varchar unique;
