-- Trello D1 follow-up: track when the Meta access token expires. Meta
-- returns expires_in (seconds) on the code exchange; the Embedded Signup
-- configuration in use issues 60-day tokens. This is just a recorded
-- timestamp, not automatic renewal -- there's no scheduled job in this
-- codebase yet to proactively refresh it, and nothing reads the token yet
-- (D4 will) to notice it going stale. See decisions.md.
alter table public.company_whatsapp_connections
  add column token_expires_at timestamptz;

-- Not sensitive (just a date), so it follows the same member-read/admin-write
-- RLS as every other connection column -- but it's a column added after the
-- prior migration's revoke-then-regrant, so it needs its own explicit grant
-- (a newly added column has no privileges for authenticated/anon by default
-- once the table-wide grant was revoked).
grant select (token_expires_at), insert (token_expires_at), update (token_expires_at)
on public.company_whatsapp_connections
to authenticated, anon;
