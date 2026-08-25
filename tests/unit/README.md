# Unit tests

Pure logic, no Supabase, no network, no Next.js server -- runs with `npm run test:unit`.

Empty for now: the current codebase's logic (route handler validation, RLS
policies) is thin enough that it's only meaningfully tested end-to-end --
see `tests/integration/`. Add files here (`*.test.ts`) once there's
standalone logic worth isolating from the HTTP/DB layer.
