-- Trello D1 fix: Meta's /register endpoint ties a phone number to a
-- two-step-verification PIN on first registration -- every subsequent
-- /register call for that same number (a reconnect, a retry) must supply
-- the *same* PIN or Meta rejects it with "(#133005) Two step verification
-- PIN Mismatch". The original code generated a fresh random PIN on every
-- call, which broke any reconnect. Storing it lets us reuse the same PIN
-- for a given company's connection.
alter table public.company_whatsapp_connections
  add column two_step_pin varchar;

-- Meta security material, same sensitivity class as access_token -- locked
-- down the same way (see the access_token comment above for why a
-- column-level revoke must follow a table-wide revoke, not stand alone).
-- Not added to any authenticated/anon grant -- only the service-role client
-- (src/lib/supabase/service.ts) can read or write it.
