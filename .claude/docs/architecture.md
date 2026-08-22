# Architecture

High-level structure of the system: main components, how they talk to each other, and why.

## Components

_TBD_

## Data model

_TBD — key Supabase tables/relationships once they exist._

## Conventions

### Supabase database changes

The Supabase CLI only picks up flat, timestamped `.sql` files directly in `supabase/migrations/` (no subfolders) — that's the single source of truth for schema and security, applied in order.

- **`supabase/migrations/`** — all schema and security changes go here as migrations, one logical change per file, named `<timestamp>_<description>.sql` (e.g. `supabase migration new create_employees_table`). This includes:
  - Table creation / alteration (`CREATE TABLE`, `ALTER TABLE`)
  - Row Level Security: `ALTER TABLE ... ENABLE ROW LEVEL SECURITY;` plus `CREATE POLICY ...` — enable RLS in the same migration that creates the table, don't leave a table without policies even temporarily
  - Indexes, functions, triggers, views
- **`supabase/seed.sql`** — local dev fixture/sample data only (not schema). Runs after migrations on `supabase db reset`. Use `INSERT ... ON CONFLICT DO UPDATE` (upsert) so it's safe to re-run.
- **`supabase/functions/`** — edge functions, one subfolder per function (Deno).

Never hand-edit the remote database directly — always go through a migration so `supabase/migrations/` stays the reproducible history of the schema.
