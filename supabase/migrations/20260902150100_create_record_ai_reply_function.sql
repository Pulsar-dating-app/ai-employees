-- Trello P2 -- record_ai_reply: the single, atomic choke point for the AI
-- reply counter. Every inbound channel (web chat, Instagram, future
-- WhatsApp) calls this exactly once per AgentEngine.run() that actually
-- sends the customer a message (wired in P7); handoff / silent / errored
-- runs do not call it. Because this is the ONLY writer of
-- company_message_usage.replies_used, a future "weight per bot or channel"
-- becomes a parameter here plus a config map -- never a migration.
--
-- Atomicity: the UPDATE takes a row lock on the period row, so concurrent
-- replies for the same company serialise on it and no increment is lost.
--
-- Row lifecycle is NOT this function's job. The P4 webhook owns creating the
-- company_message_usage row for a period (at checkout, and on every
-- renewal). "Current period" = the usage row whose period_start matches
-- company_billing.current_period_start. If there is no such row, this
-- returns zero rows and the caller proceeds WITHOUT counting and WITHOUT
-- blocking -- the soft-cap rule is "never stop from nowhere".
create function public.record_ai_reply(p_company_id uuid)
returns table (replies_used integer, reply_limit integer)
language sql
security definer
set search_path = public, pg_temp
as $$
  update public.company_message_usage u
     set replies_used = u.replies_used + 1
    from public.company_billing b
   where u.company_id = p_company_id
     and b.company_id = p_company_id
     and u.period_start = b.current_period_start
  returning u.replies_used, u.reply_limit;
$$;

-- Internal: only the service-role client (P7's channel call sites) invokes
-- this. Supabase's default privileges hand EXECUTE to anon/authenticated on
-- every new function too, so revoke that explicitly; service_role keeps it.
revoke execute on function public.record_ai_reply(uuid) from public, anon, authenticated;
grant execute on function public.record_ai_reply(uuid) to service_role;
