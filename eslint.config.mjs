import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";
import { defineConfig, globalIgnores } from "eslint/config";

const sourceFiles = ["**/*.{ts,tsx,js,mjs,cjs}"];
const tsFiles = ["**/*.{ts,tsx}"];
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

export default defineConfig([
  globalIgnores([
    "**/node_modules/**",
    "**/.next/**",
    "**/.turbo/**",
    "**/coverage/**",
    "**/dist/**",
    "**/tmp/**",
    "**/*.css",
    "**/*.d.ts",
    "**/*.tsbuildinfo",
    "**/public/**",
    "services/**"
  ]),
  js.configs.recommended,
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
