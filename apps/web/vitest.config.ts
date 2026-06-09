import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

import { chemdPackageAliases } from "../../vitest.aliases";

const srcDirectory = fileURLToPath(new URL("./src", import.meta.url));
const repoRoot = fileURLToPath(new URL("../..", import.meta.url));

export default defineConfig({
  oxc: {
    jsx: {
      importSource: "react",
      runtime: "automatic"
    }
  },
  resolve: {
    dedupe: ["react", "react-dom"],
    alias: {
      ...chemdPackageAliases,
      "@": srcDirectory,
      react: `${repoRoot}/node_modules/react`,
      "react-dom": `${repoRoot}/node_modules/react-dom`,
      "react-dom/server": `${repoRoot}/node_modules/react-dom/server`,
      "react/jsx-runtime": `${repoRoot}/node_modules/react/jsx-runtime`
    }
  }
});
