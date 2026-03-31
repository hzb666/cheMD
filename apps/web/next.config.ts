import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: [
    "@chemd/compiler",
    "@chemd/core",
    "@chemd/parser",
    "@chemd/render-profile",
    "@chemd/renderer-html",
    "@chemd/renderer-json",
    "@chemd/resolver"
  ]
};

export default nextConfig;
