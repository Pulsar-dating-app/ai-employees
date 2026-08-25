# Architecture

High-level structure of the system: main components, how they talk to each other, and why.

## Components

Sidde MVP: a platform for hiring pre-built AI employees (first: Malu, an AI sales rep) that talk to customers over WhatsApp. See `Sidde_MVP_Specification.md` (repo root) for full product spec and `Sidde_MVP_Database_Tables.md` for the original table sketch.

Supabase project: **ai-employees** (`wtewquippvcteuxzcztd`, org `pxgsqmjvtajofdyaepyr`, region us-east-2). A separate "Faceless Videos" project exists in the same org — unrelated, do not target it.

## Application

Next.js (App Router, TypeScript, Tailwind) at the repo root, alongside `supabase/` — one codebase for both the admin dashboard UI and API routes/server actions (decided over a separate backend+frontend split; see decisions.md). Source lives under `src/app/`; non-route logic (Supabase clients, future domain code) lives under `src/lib/`.

### Auth (Trello A2)

Supabase Auth via `@supabase/ssr`, cookie-based sessions:
- `src/lib/supabase/client.ts` / `server.ts` — browser and server Supabase clients.
- `src/lib/supabase/middleware.ts` + `src/proxy.ts` — refreshes the session cookie on every request (Server Components can't write cookies themselves) and gates access: unauthenticated users hitting `/dashboard*` are redirected to `/login`; authenticated users hitting `/login` or `/sign-up` are redirected to `/dashboard`. Next.js 16 renamed the `middleware.ts` convention to `proxy.ts`/`export function proxy` — this repo already uses the new name.
- `src/lib/auth/actions.ts` — `login`/`signUp`/`logout` server actions, called directly from the `/login` and `/sign-up` page forms. Auth errors are translated to user-facing copy (`friendlyAuthError`) rather than shown raw. Lives under `lib/`, not `app/`, since it isn't a route — an `app/auth/` folder with no `page.tsx` would look like a route that doesn't exist.
- `src/app/api/me/route.ts` — `GET` current-user endpoint for non-Server-Component callers.
- `src/app/dashboard/page.tsx` is the real onboarding shell as of Trello ticket F1 (see the "Onboarding shell" section below) — no longer a placeholder.
- Company creation/membership is intentionally not part of A2 — that's A3, layered on top of a logged-in user.

Env vars: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (the modern `sb_publishable_...` key, safe to expose client-side — RLS is what actually protects data). Real values live in `.env.local` (gitignored); `.env.example` has the placeholder shape.

### Companies & membership API (Trello A3)

Route Handlers under `src/app/api/companies/` — this is the API surface other epics build against, so it's plain HTTP endpoints rather than Server Actions (see decisions.md):
- `GET /api/companies` — list companies for the current user. Plain `select * from companies`; RLS (`is_company_member`) already scopes it, no manual join.
- `POST /api/companies` — create a company. Delegates to the `public.create_company_with_owner` RPC (migration `20260825154320`) so the `companies` insert + `company_users` owner insert happen atomically in one Postgres function call, since supabase-js has no client-side multi-table transaction. The function is `SECURITY DEFINER` (RLS-bypassing) and `anon` is explicitly denied EXECUTE — see decisions.md for why both were necessary, not just the obvious-looking `SECURITY INVOKER` + `revoke ... from public`.
- `POST /api/companies/[companyId]/members` — add/invite a member (no email invites in MVP; target user must already have an account). Re-checks the caller is owner/admin at the API layer (querying their own `company_users` row) before inserting, so a non-admin gets a clean 403 instead of a raw Postgres RLS error. Additionally, only an existing `owner` can assign the `owner` role to someone else — an `admin` can add members/admins but not mint another owner. This distinction is API-layer only: RLS's `is_company_admin` treats `owner`/`admin` as equivalent for every other operation (updating the company, managing membership in general), so owner-vs-admin has no meaning anywhere else in the system today.
- `GET /api/companies/[companyId]` (Trello B2) — the single-resource sibling of the list endpoint above; any member can view (`requireMember`, matches RLS's `is_company_member`). Returns the full row — profile fields (`name`/`email`/`phone`/`website_url`/`currency`/`country`/`timezone`) plus the knowledge fields (`description`/`shipping_policy`/`return_policy`/`payment_policy`/`faq`/`additional_information`) that C3's `get_business_information`/`get_policy_information` tools will read at runtime.
- `PATCH /api/companies/[companyId]` (Trello B2) — only owner/admin (`requireAdmin`, matches RLS's `is_company_admin`; the only route so far needing an admin-only file-local check that isn't the members route's bespoke owner-vs-admin logic). **Merge-patch semantics**: a key present with value `null` clears that column; an omitted key leaves it untouched — this is now the pattern for any future partial-update endpoint (e.g. B3's product update), not something to reinvent per-route. Validation limits (all file-local constants, no shared validation module exists yet): free-text fields (`description`, `shipping_policy`, `return_policy`, `payment_policy`, `additional_information`) up to 5000 chars; short profile fields up to 255 chars; `currency` exactly 3 chars (matching the DB's `varchar(3)`, checked here so a bad value 400s cleanly instead of surfacing a raw Postgres error); `faq` — see decisions.md for the shape. No RPC needed (unlike A3's create-with-owner): an UPDATE has no chicken-and-egg RETURNING-vs-SELECT-policy problem the way an INSERT-and-become-member does.
- `requireMember`/`requireAdmin` are file-local to this route (not extracted to `src/lib/`), matching B1's precedent above. Worth noting: this is now the third route file (A3's members route, B1's agents route, this one) with its own near-duplicate membership-check logic — a real candidate for extraction if a fourth shows up, but not done here since it's outside any single ticket's scope.

### Hire-an-agent API (Trello B1)

`src/app/api/companies/[companyId]/agents/[agentSlug]/route.ts` — the agent is a URL segment, not hardcoded, even though the MVP only ever hires `malu`: adding a second agent later means adding an `agents` row, not touching this route.
- `GET` — hire status for `agentSlug`: `{ companyAgent: {...} | null }`. Used by F1's onboarding wizard to decide "Hire Malu" vs "Malu is ready."
- `POST` — hire that agent: inserts a `company_agents` row directly with `status: "active"` (no `"hired"` intermediate state — see decisions.md). **Idempotent**: calling it twice returns the existing row with `200`, not an error — unlike A3's members endpoint, where a duplicate genuinely is a conflict. No RPC needed here (unlike company creation): the caller is already a company member before hiring, so there's no chicken-and-egg RLS problem to route around. Optional body `{ name?: string }` overrides the default display name (`company_agents.name` is a per-company, merchant-editable label); default is the slug capitalized (e.g. `malu` -> `Malu`) — `agents` has no `name` column of its own, only `slug`/`role`/`description`.
- Both handlers share two small file-local helpers (`requireMember`, `getAgentBySlug`) rather than duplicating the checks a second time within the same file. Unlike the earlier hardcoded-Malu version of this route, an unknown `agentSlug` is now a **`404`**, not a `500` — the slug comes from the caller (URL), so a bad one is a client error, not a platform config problem.
- Malu's `agents` row is seeded by a migration (`20260825181902_seed_malu_agent`), not `supabase/seed.sql` — `seed.sql` is local-dev-only and never touches the remote project, but Malu needs to exist there for hiring to work at all. Any future agent needs the same treatment: a migration-level insert, not a code change to this route.
- The `defaultAgentName(slug)` fallback (capitalize the slug — `agents` has no `name` column) lives in `src/lib/agents/naming.ts`, shared with the onboarding UI (below) rather than duplicated — a trivial pure-string helper, unlike the membership-check duplication above which is deliberately *not* shared.

### Onboarding shell (Trello F1)

The merchant-facing "front door" — `src/app/dashboard/` is now the real onboarding shell, not a placeholder:
- **Design system** (`src/app/globals.css`): warm-neutral palette + one near-black accent (`--color-neutral-*`, `--color-accent-*`, `--color-success-*`), Geist Sans/Mono (already loaded via `next/font/google`). Fixed a pre-existing bug where `body` hardcoded `font-family: Arial...` instead of using the already-defined `--font-sans` variable. (The accent started as amber; changed to near-black — see decisions.md.)
- **Shared primitives** (`src/components/ui/`, first use of this directory): `Button`, `Card`/`CardHeader`/`CardTitle`/`CardDescription`/`CardContent`, `Input`, `StepBadge` (done/active/locked status circle), `icons.tsx` (`CheckIcon`/`SpinnerIcon`). One new dependency, `clsx`, for conditional classNames — no icon library or variant-authoring library added (not enough variant surface yet to justify them).
- `src/app/dashboard/layout.tsx` — shared brand+logout header for everything under `/dashboard` (F2-F6 will render here too).
- `src/app/dashboard/page.tsx` (Server Component) fetches `companies`, active `agents`, and `company_agents` directly via the server Supabase client (RLS-scoped, no self-referential HTTP call to the app's own REST API), splits agents into `hiredAgents` (rendered as static done rows) and `availableAgents` (passed to `HireTeamCard`) — the loop itself has zero agent-specific branching, which is the concrete mechanism behind "add a second agent later needs no UI code change."
- `src/app/dashboard/hire-team-card.tsx` (Client Component) is the only interactive piece, and is a genuine **catalog you browse and select from** among `availableAgents`, not one card per agent: each agent renders as a full profile (`AgentProfile` — name, `role` badge, `description` bio, all real `agents` columns, not hand-written UI copy) whether there's one or several; with more than one it's a `role="radiogroup"` of selectable profile cards plus a single "Hire {selected}" button, disabled until something's picked. It calls the existing `POST /api/companies` and `POST /api/companies/[companyId]/agents/[agentSlug]` Route Handlers via client-side `fetch` — per the established convention that this app's own UI consumes API-surface Route Handlers the same way any other caller would. On success it calls `router.refresh()` rather than tracking optimistic local state, so the Server Component's real DB read is always the source of truth. The parent passes `key={availableAgents.map(a => a.id).join(",")}` when rendering it — without that, a client component's `useState` survives a `router.refresh()` when React considers it "the same" instance, so a just-hired agent's id could linger as the "selected" one even after it's no longer in `availableAgents`; the key forces a fresh mount whenever the available set changes. The already-hired list in `dashboard/page.tsx` shows each agent's `role` too, for the same "team roster" consistency.
- Company creation is folded into the Hire card itself (an inline business-name field + prompt shown only when the merchant has no company yet) rather than a separate visible step — spec's flow doesn't name "create a company" as its own step.
- "Teach your team about your business" and "Connect your team to WhatsApp" render as static "Coming soon" stub cards (Trello F2/F3 and F4 aren't built yet) — deliberately not stub *routes* (F2-F4 build their own real pages), and deliberately **not naming a specific agent** — these are company-level steps that apply regardless of how many agents are hired, so the copy says "your team," never "Malu" (see decisions.md for the correction this was).
- `agents.role`/`agents.description` **are** shown to merchants directly now (the hire catalog's whole point), so they must themselves be spec-compliant merchant-facing copy, not internal notes — Malu's `description` was rewritten in migration `20260825210027` to remove "AI" wording that violated spec §4/§28. Any future agent's seed migration must write its `role`/`description` with the same bar: this is the copy a merchant reads when deciding who to hire, not implementation documentation. One known limitation: these DB columns hold a single string each (no per-locale variant), so an agent's role/description doesn't currently translate with the rest of the UI — see decisions.md.

### Internationalization (EN/PT)

`next-intl`, cookie-based with **no `[locale]` URL segment** — deliberately, to avoid restructuring every `redirect()` call in `src/lib/auth/actions.ts`, the `proxy.ts` matcher, and every internal link (see decisions.md for why locale-prefixed routing was rejected). **The project rule — never hardcode a UI string, always add it to both message files — lives in [CLAUDE.md](../../CLAUDE.md#internationalization), not here; this section is how it's implemented, that one is what to do every time.**
- `src/i18n/request.ts` resolves the locale: an explicit `locale` cookie wins; otherwise it checks the `Accept-Language` header for a `pt` substring, defaulting to `en`. No cookie is written until the user actively picks a language via the switcher.
- `messages/en.json` / `messages/pt.json` — namespaced by area (`Auth`, `Dashboard`, `HireTeam`, `LanguageSwitcher`). Agent display names (e.g. "Malu") are DB data and are never translated, only the surrounding copy (ICU interpolation, e.g. `"Hire {name}"`).
- `src/components/language-switcher.tsx` — a plain `<select>` in `src/app/layout.tsx`'s top bar (present on every page, including pre-auth login/sign-up, since language preference matters before a merchant even signs up). Calls the `setLocale` Server Action (`src/lib/i18n/actions.ts`, mirrors `logout`'s shape) which sets the cookie, then `router.refresh()`.
- Server Components use `getTranslations` (`next-intl/server`); Client Components use `useTranslations`. `getTranslations` also works inside Server Actions invoked via `<form action={...}>` (verified for `login`/`signUp`'s error messages) — both are still ordinary requests carrying the same cookies/headers `getRequestConfig` reads from.
- Because locale resolution reads cookies/headers on every request, the app can no longer statically prerender any page (`next build`'s route list now shows everything as `ƒ` dynamic) — an expected, accepted tradeoff of request-time locale detection, not a regression to chase.
- `next.config.ts` is wrapped with `createNextIntlPlugin()`, required by the library regardless of routing mode.

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
- **events** — append-only log of the three trackable behaviors from spec §14–15: `buying_intent`, `product_recommendation`, `checkout_click` (single shared table with a `type` enum column, not one table per type). Scoped to `company_id`, `conversation_id`, `customer_id` (all required); `agent_id`/`product_id` optional. `tracking_id` is the `sidde.link/c/{tracking-id}` lookup key, set on `checkout_click` rows when the link is created and read back on click; unique when present (partial unique index). `metadata` jsonb holds type-specific extras (e.g. `destination_url`) that don't warrant their own column. No `updated_at`/no update trigger/no update or delete RLS policies — rows are never mutated after insert.

### Enum types

Fixed-value columns use real Postgres enums (not varchar+CHECK) where the value set is small and stable:
- `company_role` (`owner`/`admin`/`member`) — `company_users.role`
- `company_agent_status` (`active`/`paused`) — `company_agents.status`
- `conversation_channel` (`whatsapp` only for now) — `customers.channel` and `conversations.channel`. Adding a channel later (website, Instagram, ...) requires an `ALTER TYPE ... ADD VALUE` migration.
- `event_type` (`buying_intent`/`product_recommendation`/`checkout_click`) — `events.type`.

`conversations.status` was deliberately left as `varchar` + `CHECK` (`active`/`closed`/`paused`), not converted — only `company_agents.status` was simplified to an enum, per an explicit product decision (see decisions.md).

Not yet implemented: the checkout-link creation/redirect logic itself (spec §14, Trello tickets C4/E1) — `events` only provides the schema those write to and read from.

No `messages` table by design — message history is not persisted in our own DB. `conversations.open_ai_conversation_id` is used to fetch the full message history from OpenAI's Conversations API on demand instead.

### Access model

- All company-scoped tables (`companies`, `company_agents`, `customers`, `conversations`, `products`) are readable/writable only by members of that `company_id`, via three `security definer` helper functions: `private.is_company_member(company_id)`, `private.is_company_admin(company_id)` (admin = `owner`/`admin` role), and `private.is_company_owner(company_id)` (owner only). `is_company_owner` exists solely to gate `company_users` rows whose role is or would become `owner` — everywhere else, `owner`/`admin` are equivalent.
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

### Supabase MCP server

Configured at project scope in `.mcp.json` (checked into the repo, no secrets — it authenticates via browser OAuth):

```json
{ "mcpServers": { "supabase": { "type": "http", "url": "https://mcp.supabase.com/mcp?project_ref=wtewquippvcteuxzcztd" } } }
```

- The `project_ref` query param pins every MCP call to the **ai-employees** project, so the unrelated "Faceless Videos" project in the same org can't be touched by accident.
- `read_only` is deliberately **not** set — `apply_migration` needs write access (see the migration convention above).
- Auth is dynamic client registration (browser OAuth). Run `/mcp` in an interactive terminal session, pick `supabase`, and choose Authenticate. There is no token to store. In CI, pass a personal access token instead via a `headers` entry: `"Authorization": "Bearer ${SUPABASE_ACCESS_TOKEN}"`.
- Optional `features=<groups>` param narrows which tool groups load (e.g. `database,docs`); left at the default.

### Testing

- `npm run test:unit` — pure logic, no external services. Currently empty (see `tests/unit/README.md`).
- `npm run test:integration` — starts local Supabase (Docker), resets it from `supabase/migrations/`, boots a real `next dev` on port 3100, and runs `tests/integration/**` against it over real HTTP with real signed-up users. One command, needs Docker Desktop running. See the 2026-08-25 decisions.md entry for why this hits real infra instead of mocks.
- Local Supabase ports are shifted to `553xx` (not the `543xx` defaults) in `supabase/config.toml`, to coexist with the unrelated "Faceless Videos" project's own local stack on this machine.

**Where new tests go:**
- One file per feature/domain area: `tests/integration/<area>.test.ts` (e.g. `companies.test.ts`) for tests that go through the actual Next.js API routes over HTTP.
- `tests/integration/<table>-rls.test.ts` (e.g. `company-users-rls.test.ts`) for tests that call PostgREST/RPC directly via supabase-js, bypassing the Next.js app entirely — use this when testing an RLS policy or Postgres function itself (whether an admin/owner/member can do X), not app-layer behavior.
- Reuse `tests/integration/helpers/`: `auth.ts`'s `signUpTestUser()` for a fresh authenticated test user (returns `userId`, a ready `cookieHeader` for HTTP tests, and a `client` for direct supabase-js calls), `request.ts`'s `api()` for HTTP calls against the test server, `env.ts`'s `getTestEnv()` for the local Supabase URL/key. Don't re-implement the cookie-jar/session dance those already handle.
- `tests/unit/<name>.test.ts` only once there's pure logic worth isolating from the HTTP/DB layer (see its README).
- Once `supabase/functions/` has real edge functions: `tests/integration/<function-name>.test.ts`, calling it over HTTP against `getTestEnv().supabaseUrl + "/functions/v1/<function-name>"` — `supabase start` already runs the local edge runtime, no extra setup needed. No frontend/UI tests in this repo (see CLAUDE.md) — the priority is backend logic, edge functions, RLS, and other Supabase-level behavior.

**CI:** `.github/workflows/test.yml` runs both `unit` and `integration` as separate jobs on every PR/push targeting `main`. The `integration` job needs no extra setup beyond `npm ci` — Docker is preinstalled on `ubuntu-latest` runners and the `supabase` CLI is a devDependency, so `npx supabase` (used internally by `npm run test:integration`) just works. To actually block merging on these, enable "Require status checks to pass" for `main` in GitHub's branch protection settings and select both jobs — that part isn't in this repo, it's a GitHub UI/API setting.
