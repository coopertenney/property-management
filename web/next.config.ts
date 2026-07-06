import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // This repo has a second package.json at the root (the sync scripts), so pin the
  // Turbopack workspace root to web/ to silence the multiple-lockfiles warning.
  turbopack: { root: __dirname },
};

export default nextConfig;
