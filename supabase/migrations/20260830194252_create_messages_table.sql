-- Trello M2 -- message history for the web chat channel. A deliberate
-- reversal of this app's earlier "no messages table by design" decision
-- (see create_customers_and_conversations's own comment and
-- architecture.md's Data model section) -- scoped specifically to solving
-- refresh-continuity for a customer's browser (M3/M4), not a general
-- transcript-everything decision. Does NOT change how the Agent Engine
-- itself remembers a conversation -- that's still entirely OpenAI-side via
-- conversations.open_ai_conversation_id, unchanged.

create type public.message_role as enum ('customer', 'agent');

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  -- Duplicated onto the row directly (not just reachable via conversation_id
  -- -> conversations.company_id) for simple RLS -- same shape the events
  -- table already uses (20260825140705).
  company_id uuid not null references public.companies(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  role public.message_role not null,
  content text not null,
  created_at timestamptz not null default now()
);

create index messages_conversation_id_idx on public.messages(conversation_id);
create index messages_company_id_idx on public.messages(company_id);

-- Append-only: no updated_at column, no update trigger, no update/delete
-- policies -- matches events' own precedent exactly.
alter table public.messages enable row level security;

create policy "Company members can view messages"
on public.messages for select
using (private.is_company_member(company_id));

-- Company members can insert directly too (not just the service-role client
-- M3's public chat route will use) -- forward-looking for the deferred M8
-- human-takeover ticket, where a merchant replying from the dashboard would
-- write here via their own regular session. Mirrors events' own
-- member-insert policy, which anticipates a caller that isn't service-role
-- the same way.
create policy "Company members can create messages"
on public.messages for insert
with check (private.is_company_member(company_id));
