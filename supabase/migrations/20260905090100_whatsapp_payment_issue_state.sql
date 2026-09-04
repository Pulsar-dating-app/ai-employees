-- Trello D5 -- a WABA with no valid payment method fails EVERY outgoing
-- message, including free service-window replies (Meta error 131042,
-- "Business Eligibility Payment Issue"). This state is account-level, not
-- per message, and not something D1's connect flow can observe up front --
-- it only surfaces when D4's send call comes back with that specific error,
-- or on the periodic recheck (see the cron migration/route). Not a new enum
-- value on whatsapp_connection_status: this can be true on an otherwise
-- "connected" row, and Postgres can't ALTER TYPE ... ADD VALUE inside the
-- same transaction as other DDL, which would make this migration and any
-- later one in the same deploy awkward for no benefit over a plain column.

alter table public.company_whatsapp_connections
  add column has_payment_issue boolean not null default false,
  add column payment_issue_detected_at timestamptz;

-- Not sensitive like access_token/two_step_pin -- same open grant as the
-- rest of the connection metadata (status, display_phone_number, etc.).
grant select (has_payment_issue, payment_issue_detected_at),
      insert (has_payment_issue, payment_issue_detected_at),
      update (has_payment_issue, payment_issue_detected_at)
on public.company_whatsapp_connections
to authenticated, anon;
