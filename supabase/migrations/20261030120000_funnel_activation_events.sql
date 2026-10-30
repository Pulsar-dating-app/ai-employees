create unique index funnel_events_first_customer_conversation_idx
  on public.funnel_events (company_id)
  where event = 'first_customer_conversation';

create or replace function private.company_owner_id(p_company_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select cu.user_id
  from public.company_users cu
  where cu.company_id = p_company_id and cu.role = 'owner'
  order by cu.created_at
  limit 1;
$$;

revoke execute on function private.company_owner_id(uuid) from public, anon, authenticated;

create or replace function private.record_channel_connected()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid;
begin
  if new.status::text <> 'connected' then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.status::text = 'connected' then
    return new;
  end if;

  begin
    v_owner := private.company_owner_id(new.company_id);
    if v_owner is not null then
      insert into public.funnel_events (company_id, user_id, event, properties)
      values (new.company_id, v_owner, 'channel_connected', jsonb_build_object('channel', tg_argv[0]));
    end if;
  exception when others then
    raise warning 'record_channel_connected failed: %', sqlerrm;
  end;

  return new;
end;
$$;

revoke execute on function private.record_channel_connected() from public, anon, authenticated;

create trigger company_instagram_connections_record_connected
  after insert or update of status on public.company_instagram_connections
  for each row execute function private.record_channel_connected('instagram');

create trigger company_whatsapp_connections_record_connected
  after insert or update of status on public.company_whatsapp_connections
  for each row execute function private.record_channel_connected('whatsapp');

create or replace function private.record_first_customer_conversation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_channel text;
  v_owner uuid;
begin
  begin
    if exists (
      select 1 from public.funnel_events f
      where f.company_id = new.company_id and f.event = 'first_customer_conversation'
    ) then
      return new;
    end if;

    select c.channel::text into v_channel
    from public.conversations c
    where c.id = new.conversation_id and not c.is_preview;
    if v_channel is null then
      return new;
    end if;

    v_owner := private.company_owner_id(new.company_id);
    if v_owner is null then
      return new;
    end if;

    insert into public.funnel_events (company_id, user_id, event, properties)
    values (new.company_id, v_owner, 'first_customer_conversation', jsonb_build_object('channel', v_channel))
    on conflict do nothing;
  exception when others then
    raise warning 'record_first_customer_conversation failed: %', sqlerrm;
  end;

  return new;
end;
$$;

revoke execute on function private.record_first_customer_conversation() from public, anon, authenticated;

create trigger messages_record_first_customer_conversation
  after insert on public.messages
  for each row
  when (new.role = 'customer')
  execute function private.record_first_customer_conversation();
