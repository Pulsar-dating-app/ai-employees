-- Lets a merchant nudge the embed widget's launcher away from a corner (or
-- edge) where it's covering something on their own site -- a mobile bottom
-- nav bar was the reported case. Two settings, kept deliberately simple:
-- which bottom corner, and how far to lift it off the bottom edge.
alter table public.company_agents
  add column widget_position text not null default 'bottom-right'
    check (widget_position in ('bottom-right', 'bottom-left')),
  add column widget_offset_bottom integer not null default 0
    check (widget_offset_bottom >= 0 and widget_offset_bottom <= 200);
