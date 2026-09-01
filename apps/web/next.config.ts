import type { NextConfig } from "next";

const apiBaseUrl = process.env.EXECLOOM_API_BASE_URL ?? "http://localhost:4000";

const nextConfig: NextConfig = {
  agentRules: false,
  devIndicators: false,
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  async rewrites() {
    return [
      {
        source: "/api/backend/:path*",
        destination: `${apiBaseUrl}/:path*`
      }
    ];
  }
};

export default nextConfig;
