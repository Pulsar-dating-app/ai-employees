import path from "node:path";
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const nextConfig: NextConfig = {
  // Next 16 locks `<distDir>/dev` per project, so only one `next dev` can run
  // against a given build directory. The integration harness
  // (tests/integration/global-setup.ts) spawns its own `next dev` on port
  // 3100, which means it exits immediately with "Another next dev server is
  // already running" whenever a developer has their own dev server up — the
  // suite then fails at global setup with zero tests run. Its own distDir
  // gives it its own lock, so `npm run test:integration` works while you're
  // still looking at localhost:3000.
  distDir: process.env.NEXT_TEST_DIST_DIR ?? ".next",
  // Pin the workspace root explicitly — without this Next.js can mis-detect
  // it as a OneDrive-synced ancestor directory that also has a lockfile.
  turbopack: {
    root: path.join(__dirname),
  },
};

const withNextIntl = createNextIntlPlugin();

export default withNextIntl(nextConfig);
