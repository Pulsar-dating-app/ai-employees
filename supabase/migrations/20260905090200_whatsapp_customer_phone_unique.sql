-- Trello D2 -- dedupe an inbound WhatsApp customer by (company_id, phone),
-- the same reasoning and shape as customers_company_instagram_user_id_idx:
-- without this, a retried/concurrent webhook delivery for the same sender
-- could create two customer rows via resolveWhatsappSession's
-- select-then-insert. Partial on channel + not-null so existing
-- Instagram/web-chat rows (phone always NULL there) never collide.
create unique index customers_company_phone_whatsapp_idx
  on public.customers (company_id, phone)
  where channel = 'whatsapp' and phone is not null;
