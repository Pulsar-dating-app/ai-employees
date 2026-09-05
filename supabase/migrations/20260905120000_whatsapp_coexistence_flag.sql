-- Trello D8 -- WhatsApp Business App + Cloud API Coexistence. A coexistence
-- connection skips D1's /register (phone + PIN) step entirely, since the
-- number is already registered via the merchant's own WhatsApp Business
-- app -- the connect route needs to know which path a given row took.
alter table public.company_whatsapp_connections
  add column is_coexistence boolean not null default false;

-- Not sensitive like access_token/two_step_pin -- same open grant as the
-- rest of the connection metadata.
grant select (is_coexistence), insert (is_coexistence), update (is_coexistence)
on public.company_whatsapp_connections
to authenticated, anon;
