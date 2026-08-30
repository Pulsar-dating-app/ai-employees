import { createClient } from "@supabase/supabase-js";

// Server-only client using the project's secret/service-role key, which
// bypasses RLS entirely. Only for tables that intentionally have no RLS
// policies for anon/authenticated, like company_whatsapp_credentials
// (Trello D1) -- never use this where a regular request-scoped client
// (src/lib/supabase/server.ts) already works via RLS. Must never be
// imported from client code -- SUPABASE_SERVICE_ROLE_KEY has no
// NEXT_PUBLIC_ prefix, so Next.js won't inline it into the browser bundle.
export function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  // Fails loudly with an actionable message instead of the Supabase SDK's
  // generic "supabaseKey is required" -- this constructor throws
  // synchronously, so any caller that doesn't wrap it in try/catch turns a
  // missing env var into a bare, unlogged 500 (see the 2026-08-29
  // decisions.md entry for the real incident this was written from).
  if (!url || !serviceRoleKey) {
    throw new Error(
      "createServiceClient() called without NEXT_PUBLIC_SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY set -- " +
        "check .env.local (or the deployment's environment variables).",
    );
  }

  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
