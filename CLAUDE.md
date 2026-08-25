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

## Supabase

- Edge functions live in `supabase/functions/`.
- All schema/security changes (tables, RLS, policies, indexes, functions, triggers) go in `supabase/migrations/` as migrations — never hand-edit the DB directly. See [.claude/docs/architecture.md](.claude/docs/architecture.md#supabase-database-changes) for the convention.
- Local dev seed/fixture data (upserts only, no schema) goes in `supabase/seed.sql`.
- Local config is in `supabase/config.toml`.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
