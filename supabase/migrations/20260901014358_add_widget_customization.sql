-- Trello follow-up (embed widget customization): a merchant can replace the
-- shared default launcher (public/widget-launcher.webm) with their own
-- uploaded video or image per hired agent, and persist a custom greeting
-- instead of only setting it ad-hoc on the pasted <script> tag.
--
-- Lives on company_agents, not companies: the whole embed snippet is already
-- scoped to one (company, agent) pair -- /talk/{company}/{agent} -- so each
-- hired employee can look and sound different in their own widget, the same
-- way each has their own persona already.

alter table public.company_agents
  add column widget_greeting text,
  add column widget_launcher_type text not null default 'default'
    check (widget_launcher_type in ('default', 'video', 'image')),
  add column widget_launcher_asset_url text;

-- First real use of Supabase Storage in this app. Public bucket: launcher
-- assets are embedded on arbitrary third-party public storefronts, so they
-- must be fetchable with no auth context, the same way public/widget-launcher.webm
-- already is today.
insert into storage.buckets (id, name, public)
values ('widget-assets', 'widget-assets', true)
on conflict (id) do nothing;

-- Path convention: {companyId}/{agentId}/{filename} -- storage.foldername()
-- splits the object path into folder segments, so the first segment is the
-- company id RLS checks membership against. Same private.is_company_member()
-- helper every other table's RLS uses post-hardening (harden_function_security.sql
-- moved it out of "public" so it can't be invoked directly via PostgREST RPC).
create policy "Anyone can view widget assets"
on storage.objects for select
using (bucket_id = 'widget-assets');

create policy "Company members can upload widget assets"
on storage.objects for insert
with check (
  bucket_id = 'widget-assets'
  and private.is_company_member(((storage.foldername(name))[1])::uuid)
);

create policy "Company members can delete widget assets"
on storage.objects for delete
using (
  bucket_id = 'widget-assets'
  and private.is_company_member(((storage.foldername(name))[1])::uuid)
);
