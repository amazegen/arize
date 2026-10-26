import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep local mockups alive while production compilation validates the branch.
  distDir:
    process.env.NODE_ENV === "development" ? ".next-student-dev" : ".next",
  // This checkout can live alongside other MLC apps with their own lockfiles.
  turbopack: { root: process.cwd() },
};

export default nextConfig;
