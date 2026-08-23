# Architecture

High-level structure of the system: main components, how they talk to each other, and why.

## Components

Sidde MVP: a platform for hiring pre-built AI employees (first: Malu, an AI sales rep) that talk to customers over WhatsApp. See `Sidde_MVP_Specification.md` (repo root) for full product spec and `Sidde_MVP_Database_Tables.md` for the original table sketch.

Supabase project: **ai-employees** (`wtewquippvcteuxzcztd`, org `pxgsqmjvtajofdyaepyr`, region us-east-2). A separate "Faceless Videos" project exists in the same org — unrelated, do not target it.

## Data model

Implemented in `supabase/migrations/` (2026-08-23), all tables in `public` schema with RLS enabled:

- **users** — public profile mirroring `auth.users` (`id` FK's to `auth.users.id`). Auto-populated by a trigger (`private.handle_new_user`) on `auth.users` insert.
- **companies** — one row per merchant business (Malu's employer). Holds business info, shipping/return/payment policy text, `faq` (jsonb), currency/country/timezone.
- **company_users** — join table, user ↔ company membership with `role` (enum `company_role`: `owner`/`admin`/`member`). Unique per (company_id, user_id).
- **agents** — platform-defined AI employee catalog (e.g. Malu, slug `malu`). Managed by Sidde, not merchants; merchants only read active agents.
- **company_agents** — an agent hired by a specific company (`status`: enum `company_agent_status`, `active`/`paused` only — no separate "hired" state). Unique per (company_id, agent_id).
- **customers** — a company's end customers (`channel`: enum `conversation_channel`, currently `whatsapp` only).
- **conversations** — a thread between a customer and a company's agent; `agent_id` FKs to the global `agents` table (per `Sidde_MVP_Database_Tables.md`), not `company_agents`; `channel` uses the same `conversation_channel` enum as `customers`; `open_ai_conversation_id` links to the OpenAI-side conversation. `status` (`active`/`closed`/`paused`) is still plain `varchar` + `CHECK`, not an enum — left as-is deliberately.
- **products** — a company's catalog (name/price/currency/images/category/variants/attributes as jsonb), imported from CSV/XLSX today, designed for future ecommerce integrations (Shopify/WooCommerce/etc.) without changing Malu's `ProductRepository` abstraction.

### Enum types

Fixed-value columns use real Postgres enums (not varchar+CHECK) where the value set is small and stable:
- `company_role` (`owner`/`admin`/`member`) — `company_users.role`
- `company_agent_status` (`active`/`paused`) — `company_agents.status`
- `conversation_channel` (`whatsapp` only for now) — `customers.channel` and `conversations.channel`. Adding a channel later (website, Instagram, ...) requires an `ALTER TYPE ... ADD VALUE` migration.

`conversations.status` was deliberately left as `varchar` + `CHECK` (`active`/`closed`/`paused`), not converted — only `company_agents.status` was simplified to an enum, per an explicit product decision (see decisions.md).

Not yet implemented (see spec §14–15): `CheckoutClick`/tracking events for buying-intent and checkout-click analytics.

No `messages` table by design — message history is not persisted in our own DB. `conversations.open_ai_conversation_id` is used to fetch the full message history from OpenAI's Conversations API on demand instead.

### Access model

- All company-scoped tables (`companies`, `company_agents`, `customers`, `conversations`, `products`) are readable/writable only by members of that `company_id`, via two `security definer` helper functions: `private.is_company_member(company_id)` and `private.is_company_admin(company_id)` (admin = `owner`/`admin` role).
- These helpers live in a **`private` schema**, deliberately not listed in `supabase/config.toml`'s `[api].schemas` (only `public`, `graphql_public` are exposed) — this keeps them callable from RLS policies and triggers while blocking direct PostgREST RPC access (`/rest/v1/rpc/...`). Any new internal-only helper function should go in `private`, not `public`.
- `agents` is readable by any authenticated user (`is_active = true` rows only); only `service_role` can write to it (no insert/update/delete policies for regular users) — it's Sidde's platform catalog, not merchant-editable.
- Every table has a `before update` trigger (`public.set_updated_at`) that stamps `updated_at = now()`.

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

When applying migrations via the Supabase MCP tool (`apply_migration`), it only writes to the remote database — it does **not** create a local file. Always also write the matching `.sql` file to `supabase/migrations/` using the exact `version`/`name` reported by `list_migrations`, so local files and remote history stay identical.
