import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import sonarjs from "eslint-plugin-sonarjs";
import tseslint from "typescript-eslint";
import { defineConfig, globalIgnores } from "eslint/config";

const sourceFiles = ["**/*.{ts,tsx,js,mjs,cjs}"];
const tsFiles = ["**/*.{ts,tsx}"];
const desktopBrowserFiles = ["apps/desktop/src/**/*.{ts,tsx}"];
const webBrowserFiles = ["apps/web/src/**/*.{ts,tsx}"];
const webServerFiles = [
  "apps/web/src/server/**/*.ts",
  "apps/web/src/app/api/**/*.ts"
];
const testFiles = [
  "**/tests/**/*.{ts,tsx,js,mjs,cjs}",
  "**/*.test.{ts,tsx,js,mjs,cjs}",
  "**/*.spec.{ts,tsx,js,mjs,cjs}"
];
const scriptFiles = [
  "apps/desktop/scripts/**/*.{js,mjs,cjs}",
  "scripts/**/*.{js,mjs,cjs}",
  "*.config.{js,mjs,cjs}",
  "vitest.workspace.ts"
];

const complexityRules = {
  complexity: ["error", { max: 15 }],
  "max-params": ["error", { max: 5 }],
  "max-nested-callbacks": ["error", { max: 3 }],
  "max-depth": ["error", 4],
  "max-statements": ["error", 30],
  "max-lines-per-function": [
    "error",
    { max: 150, skipBlankLines: true, skipComments: true }
  ]
};

const sonarRecommendedRules = Object.fromEntries(
  Object.entries(sonarjs.configs.recommended.rules).map(([rule, setting]) => [
    rule,
    Array.isArray(setting) ? ["warn", ...setting.slice(1)] : "warn"
  ])
);

const sonarStyleAndOrganizationRules = {
  "sonarjs/arrow-function-convention": "off",
  "sonarjs/declarations-in-global-scope": "off",
  "sonarjs/destructuring-assignment-syntax": "off",
  "sonarjs/file-header": "off",
  "sonarjs/function-name": "off",
  "sonarjs/no-duplicate-string": "off",
  "sonarjs/no-implicit-dependencies": "off",
  "sonarjs/no-wildcard-import": "off",
  "sonarjs/redundant-type-aliases": "off",
  "sonarjs/shorthand-property-grouping": "off",
  "sonarjs/use-type-alias": "off"
};

const desktopLegacyStructureFiles = [
  "apps/desktop/src/App.tsx",
  "apps/desktop/src/MonacoChemdEditor.tsx",
  "apps/desktop/src/features/editor/monaco-chemd-editor.tsx",
  "apps/desktop/src/features/editor-tabs/editor-tabs.tsx",
  "apps/desktop/src/features/dock-panels/local-store-panel.tsx",
  "apps/desktop/src/features/settings/settings-dialog.tsx",
  "apps/desktop/src/features/workbench/desktop-editor-surface.tsx",
  "apps/desktop/src/features/workbench/editor-surface.tsx",
  "apps/desktop/src/hooks/use-connected-rag-controller.ts",
  "apps/desktop/src/hooks/use-workspace-file-controller.ts",
  "apps/desktop/src/knowledge-map/knowledge-map-panel.tsx",
  "apps/desktop/src/workspace-index/DesktopWorkspaceIndexPanel.tsx",
  "apps/desktop/src/workspace-index/workspace-index-panel.tsx"
];

export default defineConfig([
  globalIgnores([
    "**/node_modules/**",
    "**/.next/**",
    "**/.turbo/**",
    "**/coverage/**",
    "**/dist/**",
    "**/target/**",
    "**/tmp/**",
    "**/*.css",
    "**/*.d.ts",
    "**/*.tsbuildinfo",
    "**/public/**",
    "services/**"
  ]),
  js.configs.recommended,
  {
    plugins: {
      sonarjs
    },
    rules: {
      ...sonarRecommendedRules,
      ...sonarStyleAndOrganizationRules
    }
  },
  ...tseslint.configs.recommended,
  {
    files: sourceFiles,
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      parserOptions: {
        ecmaFeatures: {
          jsx: true
        }
      }
    },
    rules: {
      ...complexityRules
    }
  },
  {
    files: tsFiles,
    rules: {
      "no-undef": "off",
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^React$|^_"
        }
      ]
    }
  },
  {
    files: desktopBrowserFiles,
    languageOptions: {
      globals: {
        ...globals.browser,
        React: "readonly"
      }
    }
  },
  {
    files: webBrowserFiles,
    ignores: webServerFiles,
    languageOptions: {
      globals: {
        ...globals.browser
      }
    }
  },
  {
    files: [
      "packages/**/*.{ts,tsx}",
      "apps/web/tests/**/*.{ts,tsx}",
      ...webServerFiles,
      ...scriptFiles
    ],
    languageOptions: {
      globals: {
        ...globals.node
      }
    }
  },
  {
    files: desktopLegacyStructureFiles,
    rules: {
      complexity: ["warn", { max: 15 }],
      "max-statements": ["warn", 30],
      "max-lines-per-function": [
        "warn",
        { max: 150, skipBlankLines: true, skipComments: true }
      ]
    }
  },
  {
    files: ["apps/web/src/**/*.{ts,tsx}"],
    ignores: webServerFiles,
    plugins: {
      "react-hooks": reactHooks
    },
    rules: {
      ...reactHooks.configs.recommended.rules
    }
  },
  {
    files: testFiles,
    rules: {
      complexity: ["error", { max: 20 }],
      "max-statements": ["error", 80],
      "max-lines-per-function": [
        "error",
        { max: 300, skipBlankLines: true, skipComments: true }
      ]
    }
  }
]);
