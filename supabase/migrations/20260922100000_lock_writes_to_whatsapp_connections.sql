-- 2026-09-22 -- closes a direct-RLS bypass found while adding the WhatsApp
-- add-on entitlement gate (see decisions.md). Every write this codebase
-- makes to company_whatsapp_connections -- connect, disconnect, the D5
-- payment-issue flip, the eligibility-recheck cron, even the dev-only
-- manual-connect-test route -- already goes through the service-role
-- client (grep confirms it; several need to anyway, to write
-- access_token/two_step_pin, which are already column-locked). The original
-- migration (20260826104820) nonetheless left the table's insert/update
-- column-grants and their "Company admins can ..." RLS policies open to the
-- regular `authenticated` client, and never revoked `delete` at all (so it
-- fell back to the schema-wide blanket grant from 20260825171500) -- a
-- company admin who called Supabase's REST API directly, bypassing every
-- Next.js route (and with it, both the WhatsApp add-on entitlement gate and
-- the connect route's Meta round-trip), could insert or update a row here
-- straight past all of that. It couldn't have made WhatsApp actually work
-- (access_token stays out of reach, and Meta never sends webhooks for a
-- number our app never genuinely registered with it) -- the inbound
-- webhook's own fresh per-message entitlement check
-- (decideWhatsappPlanGate) never trusted this table's state anyway -- but
-- the door itself should be shut, the same way 20260902150000 shut it for
-- company_billing ("nobody writes it through a regular client" -- explicit
-- revoke as defence in depth, on top of removing the policy that allowed
-- it).
drop policy "Company admins can connect WhatsApp" on public.company_whatsapp_connections;
drop policy "Company admins can update their WhatsApp connection" on public.company_whatsapp_connections;
drop policy "Company admins can disconnect WhatsApp" on public.company_whatsapp_connections;

revoke insert, update, delete on public.company_whatsapp_connections from authenticated, anon;
