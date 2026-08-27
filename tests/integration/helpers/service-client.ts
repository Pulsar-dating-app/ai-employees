import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getTestEnv } from "./env";

// Mirrors src/lib/supabase/service.ts's createServiceClient(), but built
// from the local test Supabase instance's own key instead of
// SUPABASE_SERVICE_ROLE_KEY -- Vitest's own process never has that env var
// pointed at the local stack (only the spawned next-dev process does, see
// global-setup.ts), so a test calling app code in-process (Trello C1's
// Agent Engine, which has no HTTP route to go through yet) needs its own
// way to get a service-role client for the local Supabase.
export function getTestServiceClient(): SupabaseClient {
  const { supabaseUrl, serviceRoleKey } = getTestEnv();
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
