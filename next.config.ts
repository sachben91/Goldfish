import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    // Silence the workspace root warning by pointing Turbopack to this project
    root: __dirname,
  },
};

export default nextConfig;
