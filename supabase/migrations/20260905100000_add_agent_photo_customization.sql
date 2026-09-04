-- Lets a merchant pick which portrait represents a hired agent -- one of
-- two curated defaults (a real slug-specific asset today; more can be added
-- later without a schema change, see src/lib/agents/media.ts), or their own
-- uploaded photo. Shown everywhere the agent's avatar appears: the my-team
-- list, the agent's own Connections page, the dashboard sidebar/scheduling
-- rail, the conversations inbox, and the public /talk chat page.
--
-- Same shape as the widget launcher customization
-- (20260901014358_add_widget_customization.sql): a `_type` enum column plus
-- a nullable asset URL, on company_agents (not companies) since the whole
-- point is one hired employee can look different from another, even for the
-- same underlying agent template.

alter table public.company_agents
  add column photo_type text not null default 'default_1'
    check (photo_type in ('default_1', 'default_2', 'custom')),
  add column photo_asset_url text;

-- Second real use of Supabase Storage in this app (see widget-assets'
-- migration for the first). A separate bucket, not a shared one -- these are
-- a different asset class (agent portraits vs. embed-launcher media) and
-- keeping them apart means each bucket's contents stay predictable to list
-- or reason about later. Public: the photo is shown on the public /talk
-- chat page and in the embeddable widget's header, both unauthenticated.
insert into storage.buckets (id, name, public)
values ('agent-photos', 'agent-photos', true)
on conflict (id) do nothing;

-- Path convention: {companyId}/{agentId}/{filename} -- identical to
-- widget-assets, so the same private.is_company_member() check on the
-- path's first segment applies unchanged.
create policy "Anyone can view agent photos"
on storage.objects for select
using (bucket_id = 'agent-photos');

create policy "Company members can upload agent photos"
on storage.objects for insert
with check (
  bucket_id = 'agent-photos'
  and private.is_company_member(((storage.foldername(name))[1])::uuid)
);

create policy "Company members can delete agent photos"
on storage.objects for delete
using (
  bucket_id = 'agent-photos'
  and private.is_company_member(((storage.foldername(name))[1])::uuid)
);
