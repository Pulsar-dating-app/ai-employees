import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the workspace root explicitly — without this Next.js can mis-detect
  // it as a OneDrive-synced ancestor directory that also has a lockfile.
  turbopack: {
    root: path.join(__dirname),
  },
};

export default nextConfig;
