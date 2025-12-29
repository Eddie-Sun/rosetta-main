import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Avoid Turbopack "workspace root inferred" issues in this monorepo.
  // Ensures env + file watching resolve relative to the dashboard package.
};

export default nextConfig;
