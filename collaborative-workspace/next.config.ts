import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["backend-collab"],
  
  turbopack: {
    root: "../",
  },
};

export default nextConfig;