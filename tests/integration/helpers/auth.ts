import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getTestEnv } from "./env";

export interface TestUser {
  userId: string;
  cookieHeader: string;
  /** supabase-js client authenticated as this user, for tests that talk to
   * PostgREST directly instead of going through the Next.js API routes
   * (e.g. verifying an RLS policy bypasses the app entirely). */
  client: SupabaseClient;
}

let counter = 0;

// Signs up a fresh user against the local Supabase auth (email confirmation
// is disabled in supabase/config.toml, so a session comes back immediately),
// then replays that session through @supabase/ssr's cookie-writing path —
// the same trick used to manually validate A3 — to get a real
// `sb-...-auth-token` cookie header the Next.js route handlers will accept.
export async function signUpTestUser(labelPrefix = "user"): Promise<TestUser> {
  const { supabaseUrl, anonKey } = getTestEnv();
  const email = `${labelPrefix}-${Date.now()}-${counter++}@example.test`;
  const password = "TestPass123!";

  const supa = createClient(supabaseUrl, anonKey);
  const { data, error } = await supa.auth.signUp({ email, password });
  if (error) throw error;
  if (!data.session || !data.user) {
    throw new Error(
      `signUp for ${email} returned no session — check that email confirmation is disabled in supabase/config.toml`,
    );
  }

  const jar = new Map<string, string>();
  const serverClient = createServerClient(supabaseUrl, anonKey, {
    cookies: {
      getAll: () => Array.from(jar.entries()).map(([name, value]) => ({ name, value })),
      setAll: (cookiesToSet) => {
        for (const { name, value } of cookiesToSet) jar.set(name, value);
      },
    },
  });

  await serverClient.auth.setSession({
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
  });

  const cookieHeader = Array.from(jar.entries())
    .map(([name, value]) => `${name}=${value}`)
    .join("; ");

  const client = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${data.session.access_token}` } },
  });

  return { userId: data.user.id, cookieHeader, client };
}
