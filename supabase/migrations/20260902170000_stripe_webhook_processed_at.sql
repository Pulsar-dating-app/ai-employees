-- Trello P4 -- the Stripe webhook does insert-before-process for idempotency
-- (Stripe delivers every event at-least-once and retries for ~3 days). A
-- bare "event_id already exists -> skip" silently drops an event whose
-- processing threw *after* the row was inserted.
--
-- `processed_at` splits "seen" from "done": a row with processed_at IS NULL
-- means some delivery inserted it but hasn't finished -- a later Stripe
-- retry re-enters and re-processes it. Only a processed_at that's set means
-- "handled, safe to skip".
alter table public.stripe_webhook_events
  add column processed_at timestamptz;
