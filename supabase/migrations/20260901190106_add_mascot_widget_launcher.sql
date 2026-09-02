-- Widget launcher: add a fourth option, 'mascot' (BETA) -- a full-body
-- animated character that walks in along the bottom of the merchant's page
-- and greets the visitor, instead of the corner bubble every other option
-- renders. Unlike 'video'/'image' it is NOT a merchant upload: it uses a
-- bundled shared asset (public/mascot-greeting-with-bubble.{webm,mov}), so
-- widget_launcher_asset_url stays null for it, exactly like 'default'.

alter table public.company_agents
  drop constraint company_agents_widget_launcher_type_check,
  add constraint company_agents_widget_launcher_type_check
    check (widget_launcher_type in ('default', 'video', 'image', 'mascot'));
