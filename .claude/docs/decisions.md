# Decision Log

Record of notable decisions and the reasoning behind them, newest first.

## Format

```
## YYYY-MM-DD — Short title
**Decision:** what was decided.
**Why:** the reasoning / constraint / tradeoff.
```

---

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
