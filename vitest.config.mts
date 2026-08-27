import path from "node:path";
import { defineConfig } from "vitest/config";

// Two projects, run independently (see package.json scripts):
// - unit: pure logic, no external services, fast.
// - integration: hits a real local Supabase (Docker) + a real running
//   Next.js server, exactly like the manual testing that validated Trello
//   A3. global-setup.ts boots/tears down the Next server; the Supabase
//   stack itself is started/reset by the npm script before Vitest runs.
// Mirrors tsconfig.json's "@/*" -> "./src/*" -- needed the first time a test
// imports app code directly (Trello C1's Agent Engine, in both projects)
// rather than only exercising it over HTTP the way every prior integration
// test does. Each `projects` entry is its own Vite config, so this has to
// be repeated per project rather than set once at the root.
const alias = { "@": path.resolve(import.meta.dirname, "./src") };

export default defineConfig({
  test: {
    // tests/unit/ is intentionally empty right now (see its README) --
    // don't treat "no tests yet" as a CI failure.
    passWithNoTests: true,
    projects: [
      {
        resolve: { alias },
        test: {
          name: "unit",
          environment: "node",
          include: ["tests/unit/**/*.test.ts"],
        },
      },
      {
        resolve: { alias },
        test: {
          name: "integration",
          environment: "node",
          include: ["tests/integration/**/*.test.ts"],
          globalSetup: ["tests/integration/global-setup.ts"],
          testTimeout: 20_000,
          hookTimeout: 60_000,
        },
      },
    ],
  },
});
