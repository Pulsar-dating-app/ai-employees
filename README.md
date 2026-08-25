# ai-employees

## Structure

- `src/app/` — Next.js (App Router) app: the Sidde admin dashboard and API routes.
- `supabase/` — Supabase project (functions, migrations, config).
- `.claude/docs/` — living documentation (knowledge, architecture, decisions). See [CLAUDE.md](CLAUDE.md) for the rules governing how it's kept up to date.

## Running locally

1. Copy `.env.example` to `.env.local` and fill in the Supabase project URL and anon/publishable key (Project Settings -> API in the Supabase dashboard).
2. `npm install`
3. `npm run dev` — the app runs against the remote `ai-employees` Supabase project (see `.claude/docs/architecture.md`), no local Supabase stack required for auth.
