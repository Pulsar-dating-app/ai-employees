-- 2026-09-28 -- The language of the conversation an appointment was booked in,
-- so the confirmation, reminder and declined emails go out in it. Null (a
-- booking made from the dashboard, or before this column) means Portuguese.
alter table public.appointments
  add column language text check (language in ('pt', 'en', 'it'));
