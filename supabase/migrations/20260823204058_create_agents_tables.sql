-- agents: platform-defined AI employee catalog (e.g. Malu), managed by Sidde, not merchants
create table public.agents (
  id uuid primary key default gen_random_uuid(),
  slug varchar not null unique,
  role varchar,
  description text,
  personality text,
  system_prompt text,
  is_active boolean default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz default now()
);

create trigger set_agents_updated_at
before update on public.agents
for each row execute function public.set_updated_at();

alter table public.agents enable row level security;

create policy "Authenticated users can view active agents"
on public.agents for select
to authenticated
using (is_active = true);

-- company_agents: an agent hired by a specific company
create table public.company_agents (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  agent_id uuid not null references public.agents(id) on delete restrict,
  name varchar,
  status varchar check (status in ('hired', 'active', 'paused')),
  hired_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz default now(),
  unique (company_id, agent_id)
);

create index company_agents_company_id_idx on public.company_agents(company_id);
create index company_agents_agent_id_idx on public.company_agents(agent_id);

create trigger set_company_agents_updated_at
before update on public.company_agents
for each row execute function public.set_updated_at();

alter table public.company_agents enable row level security;

create policy "Company members can view hired agents"
on public.company_agents for select
using (public.is_company_member(company_id));

create policy "Company members can hire agents"
on public.company_agents for insert
with check (public.is_company_member(company_id));

create policy "Company members can update hired agents"
on public.company_agents for update
using (public.is_company_member(company_id));

create policy "Company members can remove hired agents"
on public.company_agents for delete
using (public.is_company_member(company_id));
