import { execSync, spawn, type ChildProcess } from "node:child_process";
import { fileURLToPath } from "node:url";
import { writeFileSync, rmSync } from "node:fs";
import path from "node:path";
import { startGraphApiMock } from "./helpers/graph-api-mock";

// Boots a real Next.js server, pointed at the already-running local Supabase
// stack (started/reset by the `test:integration:env:*` npm scripts before
// Vitest runs), so integration tests exercise the exact same HTTP + RLS
// path as production, the way the Trello A3 work was manually validated.

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const STATE_FILE = path.join(ROOT_DIR, "tests", "integration", ".test-env.json");
const TEST_PORT = 3100;

interface SupabaseStatus {
  API_URL: string;
  PUBLISHABLE_KEY: string;
  // Field name for the secret/service-role key varies by CLI version
  // (newer "secret key" naming vs. the legacy "service_role" naming) --
  // both are read defensively below.
  SECRET_KEY?: string;
  SERVICE_ROLE_KEY?: string;
}

function getSupabaseStatus(): SupabaseStatus {
  const raw = execSync("npx supabase status -o json", {
    cwd: ROOT_DIR,
    encoding: "utf-8",
  });
  return JSON.parse(raw);
}

async function waitForServer(url: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      await fetch(url);
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
  }
  throw new Error(`Timed out waiting for the test Next.js server at ${url}`);
}

export default async function setup() {
  const status = getSupabaseStatus();
  const baseUrl = `http://127.0.0.1:${TEST_PORT}`;
  const serviceRoleKey = status.SECRET_KEY ?? status.SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    throw new Error(
      "`supabase status -o json` returned neither SECRET_KEY nor SERVICE_ROLE_KEY -- needed to write company_whatsapp_connections.access_token (column-privilege-locked) in tests",
    );
  }

  // Stands in for the real Meta Graph API (Trello D1's WhatsApp connect
  // route) -- see graph-api-mock.ts for why this can't just be a fetch spy.
  const graphApiMock = await startGraphApiMock();

  const nextProcess: ChildProcess = spawn(
    "npx",
    ["next", "dev", "-p", String(TEST_PORT)],
    {
      cwd: ROOT_DIR,
      env: {
        ...process.env,
        // Overrides whatever's in .env.local (which points at the real
        // Supabase project) for this spawned process only.
        NEXT_PUBLIC_SUPABASE_URL: status.API_URL,
        NEXT_PUBLIC_SUPABASE_ANON_KEY: status.PUBLISHABLE_KEY,
        SUPABASE_SERVICE_ROLE_KEY: serviceRoleKey,
        META_APP_ID: "test-meta-app-id",
        META_APP_SECRET: "test-meta-app-secret",
        META_GRAPH_API_BASE_URL: graphApiMock.url,
      },
      stdio: "inherit",
      // npx resolves to npx.cmd on Windows, which spawn() can't exec
      // directly without going through a shell.
      shell: true,
    },
  );

  try {
    await waitForServer(baseUrl, 60_000);
  } catch (err) {
    killProcessTree(nextProcess);
    await graphApiMock.stop();
    throw err;
  }

  writeFileSync(
    STATE_FILE,
    JSON.stringify({ baseUrl, supabaseUrl: status.API_URL, anonKey: status.PUBLISHABLE_KEY }, null, 2),
  );

  return async () => {
    killProcessTree(nextProcess);
    await graphApiMock.stop();
    try {
      rmSync(STATE_FILE);
    } catch {
      // already gone
    }
  };
}

// With shell: true (needed so Windows can resolve npx.cmd), the spawned
// process is cmd.exe with `next dev` as its child -- child.kill() only
// signals cmd.exe and leaves next dev (and its node/turbopack children)
// running. taskkill /T kills the whole tree; on POSIX, kill() is enough.
function killProcessTree(child: ChildProcess) {
  if (process.platform === "win32" && child.pid) {
    execSync(`taskkill /pid ${child.pid} /T /F`, { stdio: "ignore" });
  } else {
    child.kill();
  }
}
