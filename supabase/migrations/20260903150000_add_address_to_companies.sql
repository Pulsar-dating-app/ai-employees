-- The business's physical address, shown in Settings → Business info and
-- surfaced to agents via get_business_information (spec §18 grounding — a
-- customer asking "where are you?" gets a real answer, not a guess). One
-- free-text field; the app caps it at 255 chars.
alter table public.companies add column address text;
