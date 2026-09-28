-- The embed widget's "custom video" launcher is replaced by "photo": the
-- agent's own profile photo (company_agents.photo_type/photo_asset_url)
-- shown as a still image in the bubble, with no upload of its own.
--
-- Rows still on 'video' fall back to the default animation. Their uploaded
-- files in the widget-assets bucket are left in place; nothing references
-- them after this.

update public.company_agents
set widget_launcher_type = 'default',
    widget_launcher_asset_url = null
where widget_launcher_type = 'video';

alter table public.company_agents
  drop constraint company_agents_widget_launcher_type_check,
  add constraint company_agents_widget_launcher_type_check
    check (widget_launcher_type in ('default', 'photo', 'image'));
