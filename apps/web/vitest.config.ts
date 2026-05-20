import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

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
      "@": srcDirectory,
      react: `${repoRoot}/node_modules/react`,
      "react-dom": `${repoRoot}/node_modules/react-dom`,
      "react-dom/server": `${repoRoot}/node_modules/react-dom/server`,
      "react/jsx-runtime": `${repoRoot}/node_modules/react/jsx-runtime`,
      "@chemd/core": `${repoRoot}/packages/core/src/index.ts`,
      "@chemd/parser": `${repoRoot}/packages/parser/src/index.ts`,
      "@chemd/diagnostics": `${repoRoot}/packages/diagnostics/src/index.ts`,
      "@chemd/step-ontology": `${repoRoot}/packages/step-ontology/src/index.ts`,
      "@chemd/interoperability": `${repoRoot}/packages/interoperability/src/index.ts`,
      "@chemd/typechecker": `${repoRoot}/packages/typechecker/src/index.ts`,
      "@chemd/runtime-lab": `${repoRoot}/packages/runtime-lab/src/index.ts`,
      "@chemd/runtime-trace": `${repoRoot}/packages/runtime-trace/src/index.ts`,
      "@chemd/lnf": `${repoRoot}/packages/lnf/src/index.ts`,
      "@chemd/resolver": `${repoRoot}/packages/resolver/src/index.ts`,
      "@chemd/render-profile": `${repoRoot}/packages/render-profile/src/index.ts`,
      "@chemd/renderer-html": `${repoRoot}/packages/renderer-html/src/index.ts`,
      "@chemd/renderer-json": `${repoRoot}/packages/renderer-json/src/index.ts`,
      "@chemd/renderer-docx": `${repoRoot}/packages/renderer-docx/src/index.ts`,
      "@chemd/compiler": `${repoRoot}/packages/compiler/src/index.ts`,
      "@chemd/compiler/node": `${repoRoot}/packages/compiler/src/node.ts`,
      "@chemd/exporter-training": `${repoRoot}/packages/exporter-training/src/index.ts`,
      "@chemd/storage-postgres": `${repoRoot}/packages/storage-postgres/src/index.ts`
    }
  }
});
