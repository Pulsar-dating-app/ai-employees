-- The Shopify catalogue sync now has two modes: a full export via the
-- GraphQL Bulk Operations API (no product-count ceiling; used on the first
-- sync and on an explicit "full re-sync") and a lightweight delta
-- (`updated_at:>` filter) for every sync after that.
--
-- A bulk operation runs async on Shopify's side and can outlast a single
-- serverless request. `bulk_sync_op_id` holds the id of the in-flight
-- operation so a follow-up "Sync now" click resumes it (downloads the
-- result, imports, clears the id) instead of starting a new one.
--
-- Not secret -- readable like the other non-token columns (a column added
-- after the create migration's schema-wide revoke/re-grant needs its own
-- explicit grant).

alter table public.company_shopify_connections
  add column bulk_sync_op_id varchar;

grant select (bulk_sync_op_id), insert (bulk_sync_op_id), update (bulk_sync_op_id)
on public.company_shopify_connections
to authenticated, anon;
