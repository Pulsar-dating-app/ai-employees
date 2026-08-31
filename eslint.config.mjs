import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    // The integration harness's own build dir (NEXT_TEST_DIST_DIR in
    // next.config.ts) — same generated output as `.next`, so it gets the
    // same treatment; without this, `npm run lint` walks the compiled
    // server bundle and reports on it.
    ".next-test/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Runtime scratch dir `supabase start` generates locally (bundled edge
    // runtime code, minified) -- already gitignored, but ESLint doesn't
    // know that on its own.
    "supabase/.temp/**",
  ]),
]);

export default eslintConfig;
