# Project Rules

## Documentation

This project keeps living documentation under [.claude/docs/](.claude/docs/):

- [.claude/docs/knowledge.md](.claude/docs/knowledge.md) — domain knowledge, glossary, context not obvious from code.
- [.claude/docs/architecture.md](.claude/docs/architecture.md) — components, data model, conventions.
- [.claude/docs/decisions.md](.claude/docs/decisions.md) — decision log, newest entries first.

**Rules for working in this repo:**

1. At the start of a non-trivial task, read the relevant file(s) in `.claude/docs/` for context before making changes.
2. When you learn something during a task that would help a future session (a new component, a domain concept, a non-obvious constraint), update the matching doc in `.claude/docs/` as part of that same task — don't leave it for later.
3. When you make a notable architectural or product decision (not just an implementation detail), add an entry to `.claude/docs/decisions.md` following the format already in that file.
4. Keep entries factual and concise. Don't document things that are already obvious from reading the code (e.g. file structure, function signatures).
5. If a doc contradicts what you find in the actual code, trust the code and fix the doc.

## Git

- **Branches:** `feature/<TrelloTicket>` for ticket-based work (e.g. `feature/A3`, matching the Trello card prefix). For work with no ticket, use `type/short-description` (e.g. `test/local-integration-environment`, `fix/...`, `chore/...`).
- **Commits:** [Conventional Commits](https://www.conventionalcommits.org/) — `type(scope): summary`, e.g. `feat(companies): add company creation and membership API`. Common types: `feat`, `fix`, `test`, `chore`, `docs`, `refactor`. Body explains *why*, not just what changed. One cohesive unit of work per commit, matching this repo's existing one-commit-per-ticket history.
- Only create commits when explicitly asked. Never push or open a PR unless separately asked to.

## Supabase

- Edge functions live in `supabase/functions/`.
- All schema/security changes (tables, RLS, policies, indexes, functions, triggers) go in `supabase/migrations/` as migrations — never hand-edit the DB directly. See [.claude/docs/architecture.md](.claude/docs/architecture.md#supabase-database-changes) for the convention.
- Local dev seed/fixture data (upserts only, no schema) goes in `supabase/seed.sql`.
- Local config is in `supabase/config.toml`.

## Internationalization

- This app supports English and Portuguese (`next-intl`, cookie-based — no `[locale]` URL segment; see `.claude/docs/architecture.md#internationalization-enpt`). Every new user-facing string in a page or component must go through this system.
- **Never hardcode a UI string.** Add it to both `messages/en.json` and `messages/pt.json` under the appropriate namespace, then read it with `getTranslations` (Server Components/Actions) or `useTranslations` (Client Components) — not a literal string in JSX.
- Interpolate dynamic values with ICU placeholders (`"Hire {name}"`), never string concatenation.
- **Exception — don't translate data, only copy around it.** Agent names/roles/descriptions (`agents.slug`/`role`/`description`), company names, and other merchant-entered or DB-sourced content are data, not UI chrome — they stay as stored, in whichever language they were entered in. Only the surrounding interface text (labels, buttons, headings, instructions) goes through the message files.
- Adding a third language later: a third `messages/<locale>.json` file plus one entry in `SUPPORTED_LOCALES` (`src/i18n/request.ts`) — no routing changes needed.
- Merchant-facing copy (translated or not) must still follow the product-language rules in `Staffra_MVP_Specification.md` §4/§28 — never expose "agent," "prompt," "LLM," "AI," "embeddings," or similar implementation jargon, in either language.

## Testing

- When adding or changing a feature with real logic (API route, RLS policy, Postgres function, auth flow), write or update tests as part of that same task — don't leave it for later or wait to be asked.
- Prefer integration tests (`tests/integration/`, run via `npm run test:integration`) over mocks for anything touching RLS, auth, or Postgres — mocks can't catch policy/grant bugs; see `.claude/docs/decisions.md`'s 2026-08-25 testing entries for real examples this caught. See `.claude/docs/architecture.md#testing` for how the local environment works.
- `tests/unit/` is for pure logic with no DB/HTTP dependency — only add tests there when such logic actually exists; don't force it.
- Not every change needs a new test (e.g. a doc update, a config tweak) — use judgment, but default to testing behavior that could break silently.
- **No frontend/UI tests** (component tests, browser/e2e tests) — out of scope for this project's test suite.
- **Priority order for what to test:** backend logic (API routes, server actions), Supabase Edge Functions (once any exist under `supabase/functions/`), RLS policies, and any other Supabase-level behavior (Postgres functions/RPCs, triggers, grants). This is exactly what `tests/integration/` is built for — see the "Where new tests go" note in `.claude/docs/architecture.md#testing`.
- **Tests only ever run against the local Supabase stack, never the remote `ai-employees` project.** `tests/integration/helpers/env.ts` and `global-setup.ts` get connection info from `supabase status` (local), not from `.env.local` (remote) — don't hardcode the remote URL/key into a test, and don't point a test's Supabase client at anything other than what `getTestEnv()` returns.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
