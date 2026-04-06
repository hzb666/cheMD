import type { NextConfig } from "next";
import webpack from "webpack";

const nextConfig: NextConfig = {
  transpilePackages: [
    "@chemd/compiler",
    "@chemd/core",
    "@chemd/parser",
    "@chemd/render-profile",
    "@chemd/renderer-html",
    "@chemd/renderer-json",
    "@chemd/resolver"
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
