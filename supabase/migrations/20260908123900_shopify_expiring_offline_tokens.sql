-- Shopify stopped accepting non-expiring offline access tokens for the
-- Admin API (403 "Non-expiring access tokens are no longer accepted").
-- The connect flow now requests an EXPIRING offline token (expiring=1 on
-- the code exchange): a 1-hour access token plus a 90-day refresh token.
-- The catalogue sync refreshes the access token before use when it's
-- expired.
--
-- Two new columns:
--  * refresh_token -- column-privilege-locked to the service role, same as
--    access_token (added to no grant below).
--  * token_expires_at -- when the access token dies; readable by members
--    like the other non-secret columns, so it gets an explicit grant (a
--    column added after the schema-wide revoke/re-grant in the create
--    migration is otherwise inaccessible -- same as I1's
--    add_token_expires_at_to_whatsapp_connections).

alter table public.company_shopify_connections
  add column refresh_token text,
  add column token_expires_at timestamptz;

grant select (token_expires_at), insert (token_expires_at), update (token_expires_at)
on public.company_shopify_connections
to authenticated, anon;

-- refresh_token is deliberately granted to nobody -> service-role only.
