-- Every table so far worked only because Supabase's hosted platform grants
-- anon/authenticated/service_role standard DML privileges on every table
-- automatically when a project is first provisioned -- verified present on
-- the remote "ai-employees" project, but that bootstrap is a hosted-platform
-- behavior, not something any of our own migrations ever declared. A fresh
-- local `supabase start`/`db reset` (self-hosted Postgres image, no hosted
-- bootstrap) starts with only REFERENCES/TRIGGER/TRUNCATE granted -- every
-- SELECT/INSERT/UPDATE/DELETE call fails with "permission denied for table
-- X", independent of and before RLS is even evaluated. RLS remains the real
-- access boundary (e.g. anon can never satisfy auth.uid() is not null);
-- these grants just make that reachable at all, in any environment.
grant select, insert, update, delete on all tables in schema public to anon, authenticated, service_role;

-- So every future CREATE TABLE in this schema gets the same grants without
-- needing this repeated migration by migration.
alter default privileges in schema public
  grant select, insert, update, delete on tables to anon, authenticated, service_role;
