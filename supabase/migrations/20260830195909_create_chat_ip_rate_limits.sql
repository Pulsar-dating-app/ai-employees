-- Trello M3 -- per-IP rolling-window rate limiting for the public chat API.
-- One row per attempt (recorded right after the rate-limit check passes,
-- before calling AgentEngine.run(), so a failed/retried attempt still
-- counts). Never exposed to any client role -- RLS enabled with zero
-- policies, only the service-role client (which bypasses RLS) can touch it,
-- same "deny everyone but the one caller who needs it" shape used
-- elsewhere in this schema for internal-only state.
create table public.chat_ip_rate_limits (
  id uuid primary key default gen_random_uuid(),
  ip varchar not null,
  created_at timestamptz not null default now()
);

create index chat_ip_rate_limits_ip_created_at_idx on public.chat_ip_rate_limits(ip, created_at);

alter table public.chat_ip_rate_limits enable row level security;
