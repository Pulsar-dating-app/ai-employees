-- A second embed launcher style, alongside the existing bubble: "classic"
-- (the circular floating bubble, unchanged) and "immersive" (the character
-- floats directly over the page, no border/background -- background removal
-- happens live in the browser via canvas, not baked into the video file;
-- see decisions.md for why).
--
-- Scoped to widget_launcher_type = 'default' only: a merchant's own
-- uploaded video/image (launcher_type 'video'/'image') always renders as
-- the classic bubble -- we don't know a custom upload's background color to
-- key it out safely, so immersive is only offered for the curated default
-- assets today. This column still exists unconditionally on every hire
-- (not just ones using the default) so a merchant can switch back to
-- 'default' + 'immersive' later without losing the choice.

alter table public.company_agents
  add column widget_launcher_style text not null default 'classic'
    check (widget_launcher_style in ('classic', 'immersive'));
