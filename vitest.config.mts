import { defineConfig } from "vitest/config";

// Two projects, run independently (see package.json scripts):
// - unit: pure logic, no external services, fast.
// - integration: hits a real local Supabase (Docker) + a real running
//   Next.js server, exactly like the manual testing that validated Trello
//   A3. global-setup.ts boots/tears down the Next server; the Supabase
//   stack itself is started/reset by the npm script before Vitest runs.
export default defineConfig({
  test: {
    // tests/unit/ is intentionally empty right now (see its README) --
    // don't treat "no tests yet" as a CI failure.
    passWithNoTests: true,
    projects: [
      {
        test: {
          name: "unit",
          environment: "node",
          include: ["tests/unit/**/*.test.ts"],
        },
      },
      {
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
