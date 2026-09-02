-- Retire the 'mascot' widget launcher option.
--
-- It was added by 20260901190106_add_mascot_widget_launcher as a BETA and
-- never shipped with app code -- no UI, no i18n string, no bundled asset
-- ever referenced it -- so the 'mascot' value has only ever been an
-- orphaned entry in the check constraint. This restores the original set
-- from 20260901014358_add_widget_customization.

-- Defensive: nothing in the app can produce this value, but a row holding
-- it would fail the tightened constraint's validation.
update public.company_agents
set widget_launcher_type = 'default',
    widget_launcher_asset_url = null
where widget_launcher_type = 'mascot';

alter table public.company_agents
  drop constraint company_agents_widget_launcher_type_check,
  add constraint company_agents_widget_launcher_type_check
    check (widget_launcher_type in ('default', 'video', 'image'));
