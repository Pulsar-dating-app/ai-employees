alter table public.companies
  add column onboarding_completed_at timestamptz;

comment on column public.companies.onboarding_completed_at is
  'When the merchant finished the first-session flow (src/app/onboarding). Set once, from the last step, and never cleared. Every onboarding route bounces a company carrying this straight to the dashboard -- without it, "has the merchant finished?" would have to be derived from whether a catalogue exists, which sends anyone who later empties their catalogue back through a flow they already completed, and leaves a completed merchant who bookmarks /onboarding permanently landing in the proof chat.';
