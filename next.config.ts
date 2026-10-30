import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep local mockups alive while production compilation validates the branch.
  distDir:
    process.env.NODE_ENV === "development" ? ".next-student-dev" : ".next",
  // This checkout can live alongside other MLC apps with their own lockfiles.
  turbopack: { root: process.cwd() },
  async headers() {
    if (process.env.ARIZE_EDITION !== "student") return [];
    // Baseline restrictions; this is not a nonce-based script CSP.
    const headers = [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Referrer-Policy", value: "no-referrer" },
      { key: "Permissions-Policy", value: "camera=(), geolocation=(), microphone=(self)" },
      { key: "Content-Security-Policy", value: "object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'" },
    ];
    return ["/student/:path*", "/api/student/:path*", "/auth/callback"].map(source => ({ source, headers }));
  },
};

export default nextConfig;
