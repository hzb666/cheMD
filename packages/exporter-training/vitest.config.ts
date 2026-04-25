import { defineConfig } from "vitest/config";

import { chemdPackageAliases } from "../../vitest.aliases";

export default defineConfig({
  resolve: {
    alias: chemdPackageAliases
  }
});
