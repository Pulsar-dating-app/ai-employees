# Decision Log

Record of notable decisions and the reasoning behind them, newest first.

## Format

```
## YYYY-MM-DD — Short title
**Decision:** what was decided.
**Why:** the reasoning / constraint / tradeoff.
```

---

## 2026-08-25 — Single shared `events` table for tracking/analytics
**Decision:** Added one `events` table (migration `20260825140705_create_events_table`) covering all three spec §14–15 tracked behaviors — `buying_intent`, `product_recommendation`, `checkout_click` — distinguished by an `event_type` enum column, rather than three separate tables. `company_id`/`conversation_id`/`customer_id` are required; `agent_id`/`product_id` are optional (`on delete set null`). Added a `tracking_id` column (partial unique index, nullable) as the `sidde.link/c/{tracking-id}` lookup key for checkout-click events, plus a catch-all `metadata` jsonb for type-specific extras like `destination_url`. No `updated_at` column, no update trigger, and only select/insert RLS policies (company-membership scoped) — rows are append-only.
**Why:** This was Trello ticket A1 (Sidde board), a foundational, no-dependency ticket meant to unblock the buying-intent (C6), checkout-link (C4), checkout-click redirect (E1), and analytics aggregation (E2) tickets. A shared table keeps E2's per-company rollup a single group-by-type query instead of three separate ones, and matches the project's existing "convert small stable value sets to a real enum" convention (see the 2026-08-23 enum entry below) for `type`.
**How to apply:** C4 (create_checkout_link tool) should insert a `checkout_click`-typed row with `tracking_id` set and `destination_url` in `metadata` when generating a link. E1 (redirect service) looks the row up by `tracking_id`. C6 (buying-intent detection) and the product-recommendation flow insert their own typed rows the same way, no `tracking_id` needed. Never add an `updated_at`/update policy to this table — if a future need requires mutating events, treat that as a new decision, not a default extension.

## 2026-08-25 — Supabase MCP server pinned to the ai-employees project
**Decision:** Added the hosted Supabase MCP server (`https://mcp.supabase.com/mcp`) at project scope in `.mcp.json`, with `?project_ref=wtewquippvcteuxzcztd` and without `read_only`.
**Why:** The org contains a second, unrelated project ("Faceless Videos"); pinning `project_ref` makes targeting the wrong database impossible rather than merely discouraged. `read_only=true` was rejected because the documented migration workflow uses the MCP `apply_migration` tool, which needs write access. The file is safe to commit since auth is browser OAuth (dynamic client registration), not a stored token.
**How to apply:** Authenticate once per machine with `/mcp` in an interactive terminal (IDE sessions can't run the OAuth flow). Don't drop the `project_ref` param. For CI, add an `Authorization: Bearer ${SUPABASE_ACCESS_TOKEN}` header instead of OAuth.

## 2026-08-23 — No messages table
**Decision:** Dropped `messages` from MVP scope entirely — not deferred, not planned. Conversation message history will not be persisted in our own database.
**Why:** `conversations.open_ai_conversation_id` already exists to let us fetch full message history from OpenAI's Conversations API on demand, so a local `messages` table would just duplicate what OpenAI already stores.
**How to apply:** Don't add a `messages` table or reintroduce message persistence without checking with the user first — this was an explicit scope cut, not an oversight. Anything needing conversation history (analytics, transcripts, agent context) should read it via the OpenAI Conversations API using `open_ai_conversation_id`.

## 2026-08-23 — Fixed-value columns converted to Postgres enums
**Decision:** Converted three varchar+CHECK columns to real Postgres enum types: `company_users.role` → `company_role` (`owner`/`admin`/`member`, unchanged values), `company_agents.status` → `company_agent_status` (simplified from `hired`/`active`/`paused` down to just `active`/`paused` — dropped the "hired" state), and `customers.channel` / `conversations.channel` → shared `conversation_channel` enum (`whatsapp` only for now).
**Why:** User request, to get type-safety on fixed-value columns instead of relying on CHECK constraints. `company_agents.status` was intentionally simplified to 2 values rather than converted 1:1 — user's call, not carried through to `conversations.status` (still `active`/`closed`/`paused` as varchar+CHECK, deliberately left unconverted).
**How to apply:** When an app needs to hire an agent, `company_agents.status` now only has `active`/`paused` — there's no intermediate "hired but not yet active" state, so hiring flow must decide this at insert time. New channels (beyond `whatsapp`) require an `ALTER TYPE conversation_channel ADD VALUE '...'` migration, not a data-only change — this is a tradeoff since the spec lists future channels (website, Instagram, TikTok) as roadmap items.

## 2026-08-23 — Internal RLS helper functions live in a `private` schema
**Decision:** `is_company_member`, `is_company_admin`, and `handle_new_user` were created in `public`, then moved to a new `private` schema not listed in `supabase/config.toml`'s `[api].schemas`.
**Why:** Supabase's security advisor flags `security definer` functions reachable via PostgREST RPC (`/rest/v1/rpc/...`) as publicly callable. These functions only exist to be called from inside RLS policies/triggers, not directly by clients. Putting them in an API-unexposed schema removes the RPC surface while leaving them fully usable from RLS (which executes in-database, unaffected by PostgREST schema exposure).

## 2026-08-23 — Initial MVP schema created
**Decision:** Created all 8 tables from `Sidde_MVP_Database_Tables.md` (users, companies, company_users, agents, company_agents, customers, conversations, products) on the `ai-employees` Supabase project, with RLS enabled and company-membership-scoped policies on every company-owned table. `users.id` FKs to `auth.users.id` and is auto-populated via a trigger on signup, matching the spec's "sign up → hire Malu" flow.
**Why:** First concrete implementation step per the MVP spec; establishes the data layer before any backend/agent logic. `conversations.agent_id` was kept as a FK to the global `agents` table (not `company_agents`) to match the doc literally, even though `company_agents` is the more specific "which hired instance" reference — worth revisiting when the conversations/messages backend is built.
**Not yet built:** `CheckoutClick`/analytics event tables (spec sections 14–15) — deferred to a later migration once the tracking-link design is settled. (A `messages` table was also considered here but later dropped from scope entirely — see the 2026-08-23 "No messages table" entry above.)

## 2026-08-22 — Project bootstrap
**Decision:** Initialized base project structure with Supabase (functions + migrations) and `.claude` docs (knowledge, architecture, decisions) for future feature work.
**Why:** Establish terrain before real implementation begins, with rules so Claude keeps these docs in sync going forward.
