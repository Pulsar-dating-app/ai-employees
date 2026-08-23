-- company_users.role: owner/admin/member, now a real enum instead of varchar+CHECK
create type public.company_role as enum ('owner', 'admin', 'member');

alter table public.company_users
  drop constraint company_users_role_check;

alter table public.company_users
  alter column role type public.company_role using role::public.company_role;

-- company_agents.status: simplified to active/paused (drops the separate "hired" state)
create type public.company_agent_status as enum ('active', 'paused');

alter table public.company_agents
  drop constraint company_agents_status_check;

alter table public.company_agents
  alter column status type public.company_agent_status using status::public.company_agent_status;

-- conversation channel: MVP only supports whatsapp; more values added via ALTER TYPE later
create type public.conversation_channel as enum ('whatsapp');

alter table public.customers
  alter column channel type public.conversation_channel using channel::public.conversation_channel;

alter table public.conversations
  alter column channel type public.conversation_channel using channel::public.conversation_channel;
