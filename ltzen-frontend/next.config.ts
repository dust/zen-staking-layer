import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // Pin the workspace root to this app so Next doesn't get confused by the repo-root lockfile.
  turbopack: {
    root: path.resolve(__dirname),
  },
};

export default nextConfig;
