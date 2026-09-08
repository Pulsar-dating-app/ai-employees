-- Reverts 20260907120000_add_widget_launcher_style.sql -- the "Immersive"
-- embed style was pulled from the MVP (transparency quality wasn't good
-- enough after multiple fix attempts; see decisions.md), while the rest of
-- that day's work (Ana's own classic launcher video, the per-agent default
-- greeting) stays. No code references this column anymore.
alter table public.company_agents
  drop column if exists widget_launcher_style;
