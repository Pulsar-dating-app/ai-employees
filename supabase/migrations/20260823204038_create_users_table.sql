-- users: public profile row mirroring auth.users, one per authenticated account
create table public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  email varchar not null unique,
  name varchar,
  created_at timestamptz not null default now(),
  updated_at timestamptz default now()
);

create trigger set_users_updated_at
before update on public.users
for each row execute function public.set_updated_at();

alter table public.users enable row level security;

create policy "Users can view own profile"
on public.users for select
using (id = auth.uid());

create policy "Users can update own profile"
on public.users for update
using (id = auth.uid());

-- Auto-provision a public.users row whenever a new auth.users account is created
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (id, email, name)
  values (new.id, new.email, new.raw_user_meta_data ->> 'name')
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();
