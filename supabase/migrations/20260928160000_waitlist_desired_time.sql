-- 2026-09-28 -- Waitlist entries can carry the start time the customer needs
-- (see decisions.md "The waitlist remembers the time asked for").
--
-- Found in testing: a customer who needed "exatamente às 10h" was told they
-- were on the list "para as 10h", but the entry only stored the date -- any
-- opening that day would have been emailed. desired_time NULL keeps today's
-- meaning (any time in the window); set, only an opening that starts at that
-- local time notifies them.

alter table public.appointment_waitlist
  add column desired_time time;

-- Same one-open-entry-per-window rule, now per time too: waiting for 10h and
-- for 15h on the same day are two different wishes. -1 stands for "any time"
-- (epoch seconds of a real time are never negative).
drop index public.appointment_waitlist_open_dedupe_idx;

create unique index appointment_waitlist_open_dedupe_idx
  on public.appointment_waitlist (
    company_id, customer_id, service_id,
    coalesce(professional_id, '00000000-0000-0000-0000-000000000000'::uuid),
    desired_from, desired_to,
    coalesce(extract(epoch from desired_time), -1)
  )
  where notified_at is null;

-- Content-only edit to Ana's stored prompt, regexp_replace style (see
-- 20260921130000 for why not a full rewrite; a pattern that no longer matches
-- is a harmless no-op). "first come, first served" came out in Portuguese as
-- "por ordem de chegada", which reads as "you'll be served in the order you
-- joined" -- the opposite of the point: the opening isn't held for anyone,
-- whoever books first gets it.
update public.agents
set system_prompt = regexp_replace(
      system_prompt,
      'Make clear the spot isn''t held and it''s first come, first served -- you can''t promise anything will open up\.',
      'Make clear the spot isn''t held for them: you''ll email them when something opens, and whoever books first gets it (in Portuguese, say it like "a vaga não fica reservada: quem agendar primeiro garante" -- never "ordem de chegada") -- and you can''t promise anything will open up.',
      'g'
    )
where slug = 'ana';
