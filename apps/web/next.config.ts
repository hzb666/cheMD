import type { NextConfig } from "next";
import webpack from "webpack";

const nextConfig: NextConfig = {
  experimental: {
    reactCompiler: true,
  },
  transpilePackages: [
    "@chemd/compiler",
    "@chemd/core",
    "@chemd/diagnostics",
    "@chemd/exporter-training",
    "@chemd/lnf",
    "@chemd/parser",
    "@chemd/render-profile",
    "@chemd/renderer-docx",
    "@chemd/renderer-html",
    "@chemd/renderer-json",
    "@chemd/resolver",
    "@chemd/runtime-lab",
    "@chemd/runtime-trace",
    "@chemd/step-ontology",
    "@chemd/typechecker"
  ],
  webpack: (config) => {
    config.resolve.alias = {
      ...(config.resolve.alias ?? {}),
      canvas: false,
      jsdom: false,
      "jsdom/lib/jsdom/living/generated/utils": false,
      "source-map-support": false
    };

    config.plugins = config.plugins ?? [];
    config.plugins.push(
      new webpack.IgnorePlugin({
        resourceRegExp: /^\.\/node\/self\.js$/,
        contextRegExp: /paper[\\/]dist$/
      }),
      new webpack.IgnorePlugin({
        resourceRegExp: /^\.\/node\/extend\.js$/,
        contextRegExp: /paper[\\/]dist$/
      })
    );

    return config;
  }
};

export default nextConfig;
