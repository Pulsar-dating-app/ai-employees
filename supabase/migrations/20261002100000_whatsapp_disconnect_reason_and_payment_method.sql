alter table public.company_whatsapp_connections
  add column disconnect_reason text check (disconnect_reason in ('plan_changed')),
  add column needs_payment_method boolean not null default false;

grant select (disconnect_reason, needs_payment_method)
on public.company_whatsapp_connections
to authenticated;
