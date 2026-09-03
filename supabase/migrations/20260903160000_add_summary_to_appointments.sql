-- A short, professional-facing recap of what the appointment is about — the
-- customer's reason / situation as Ana understood it from the chat, written
-- for the practitioner to read at a glance. NOT the raw transcript. Written
-- by book_appointment (Ana composes it), shown on the dashboard appointment
-- card and pushed to the Google Calendar event description.
alter table public.appointments add column summary text;
