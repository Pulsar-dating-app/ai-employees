-- 2026-09-28 -- The waitlist is out of the MVP (see decisions.md "The
-- waitlist is removed from the MVP"). 20260928170000 removed it from Ana and
-- the code; the owner then asked for the table to go too. Nothing references
-- it (no foreign keys, views or functions), and it held only test entries.
-- Its indexes, RLS policies and the composite professional FK go with it.
-- A future waitlist starts from a new design, not from this table.
drop table public.appointment_waitlist;
