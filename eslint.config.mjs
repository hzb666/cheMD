import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";
import { defineConfig, globalIgnores } from "eslint/config";

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
    files: ["**/*.{ts,tsx,js,mjs}"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      parserOptions: {
        ecmaFeatures: {
          jsx: true
        }
      },
      globals: {
        ...globals.browser,
        ...globals.node
      }
    },
    plugins: {
      "react-hooks": reactHooks
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      complexity: ["error", { max: 15 }],
      "max-params": ["error", { max: 5 }],
      "max-nested-callbacks": ["error", { max: 3 }],
      "max-depth": ["error", 4],
      "max-statements": ["error", 30],
      "max-lines-per-function": [
        "error",
        { max: 150, skipBlankLines: true, skipComments: true }
      ],
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^React$|^_"
        }
      ],
      "no-undef": "off"
    }
  }
]);
