-- 2026-09-22 -- same fix as 20260922100000_lock_writes_to_whatsapp_connections.sql,
-- applied to the other three "channel connection" tables that were scaffolded
-- from the same original pattern: company_calendar_connections,
-- company_instagram_connections, company_shopify_connections. Every real
-- write in this codebase to these three tables already goes through the
-- service-role client (grep-verified across each connect/disconnect route --
-- several need to anyway, to write access_token/refresh_token, which are
-- already column-locked). Their insert/update/delete grants and "Company
-- admins can connect/update/disconnect ..." RLS policies were nonetheless
-- still open to the regular authenticated client, letting a company admin
-- write a connection row directly via PostgREST, bypassing the connect
-- route's real OAuth/token-exchange round trip entirely (scoped to their own
-- company only -- not the cross-company escalation company_users had).
--
-- tests/integration/company-instagram-connections-rls.test.ts and
-- company-shopify-connections-rls.test.ts drove several of their assertions
-- through this now-closed direct-write path (predating each table's real
-- connect route) -- updated in the same commit to go through the real
-- connect/disconnect routes instead, matching
-- company-calendar-connections-rls.test.ts and
-- company-whatsapp-connections-rls.test.ts's existing shape.
drop policy "Company admins can connect a calendar" on public.company_calendar_connections;
drop policy "Company admins can update their calendar connection" on public.company_calendar_connections;
drop policy "Company admins can disconnect their calendar" on public.company_calendar_connections;
revoke insert, update, delete on public.company_calendar_connections from authenticated, anon;

drop policy "Company admins can connect Instagram" on public.company_instagram_connections;
drop policy "Company admins can update their Instagram connections" on public.company_instagram_connections;
drop policy "Company admins can disconnect Instagram" on public.company_instagram_connections;
revoke insert, update, delete on public.company_instagram_connections from authenticated, anon;

drop policy "Company admins can connect Shopify" on public.company_shopify_connections;
drop policy "Company admins can update their Shopify connection" on public.company_shopify_connections;
drop policy "Company admins can disconnect Shopify" on public.company_shopify_connections;
revoke insert, update, delete on public.company_shopify_connections from authenticated, anon;
