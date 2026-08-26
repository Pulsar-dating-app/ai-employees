import { createClient } from "@supabase/supabase-js";

// Server-only client using the project's secret/service-role key, which
// bypasses RLS entirely. Only for tables that intentionally have no RLS
// policies for anon/authenticated, like company_whatsapp_credentials
// (Trello D1) -- never use this where a regular request-scoped client
// (src/lib/supabase/server.ts) already works via RLS. Must never be
// imported from client code -- SUPABASE_SERVICE_ROLE_KEY has no
// NEXT_PUBLIC_ prefix, so Next.js won't inline it into the browser bundle.
export function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}
