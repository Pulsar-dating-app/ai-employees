-- Trello H3 — merchant-configurable choice between auto-confirming a booked
-- appointment or holding it as 'requested' until the merchant approves
-- (see appointment_status below). Same flat-column-on-companies shape as
-- timezone/currency/industry, updated through the existing PATCH
-- /api/companies/[companyId] route rather than a new endpoint.
alter table public.companies
  add column requires_appointment_approval boolean not null default false;
