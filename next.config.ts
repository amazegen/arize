import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // This checkout can live alongside other MLC apps with their own lockfiles.
  turbopack: { root: process.cwd() },
};

export default nextConfig;
