import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const STATE_FILE = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  ".test-env.json",
);

export interface TestEnv {
  baseUrl: string;
  supabaseUrl: string;
  anonKey: string;
  serviceRoleKey: string;
}

// Reads the connection info global-setup.ts wrote after booting the test
// Next.js server + resolving the local Supabase stack's URL/key.
export function getTestEnv(): TestEnv {
  return JSON.parse(readFileSync(STATE_FILE, "utf-8"));
}
