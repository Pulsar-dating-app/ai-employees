-- customers: end customers messaging a company's agent on a channel (e.g. WhatsApp)
create table public.customers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name varchar,
  phone varchar,
  channel varchar,
  created_at timestamptz not null default now(),
  updated_at timestamptz default now()
);

create index customers_company_id_idx on public.customers(company_id);

create trigger set_customers_updated_at
before update on public.customers
for each row execute function public.set_updated_at();

alter table public.customers enable row level security;

create policy "Company members can view customers"
on public.customers for select
using (public.is_company_member(company_id));

create policy "Company members can create customers"
on public.customers for insert
with check (public.is_company_member(company_id));

create policy "Company members can update customers"
on public.customers for update
using (public.is_company_member(company_id));

create policy "Company members can delete customers"
on public.customers for delete
using (public.is_company_member(company_id));

-- conversations: a conversation thread between a customer and a company's agent
create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  agent_id uuid references public.agents(id) on delete set null,
  customer_id uuid not null references public.customers(id) on delete cascade,
  channel varchar,
  open_ai_conversation_id varchar,
  status varchar check (status in ('active', 'closed', 'paused')),
  created_at timestamptz not null default now(),
  updated_at timestamptz default now()
);

create index conversations_company_id_idx on public.conversations(company_id);
create index conversations_customer_id_idx on public.conversations(customer_id);
create index conversations_agent_id_idx on public.conversations(agent_id);

create trigger set_conversations_updated_at
before update on public.conversations
for each row execute function public.set_updated_at();

alter table public.conversations enable row level security;

create policy "Company members can view conversations"
on public.conversations for select
using (public.is_company_member(company_id));

create policy "Company members can create conversations"
on public.conversations for insert
with check (public.is_company_member(company_id));

create policy "Company members can update conversations"
on public.conversations for update
using (public.is_company_member(company_id));

create policy "Company members can delete conversations"
on public.conversations for delete
using (public.is_company_member(company_id));
