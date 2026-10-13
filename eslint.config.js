// @ts-check
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";
import globals from "globals";

/**
 * Flat ESLint config for the route B tree: a stdio MCP server.
 *
 * The former dashboard / Electron / client-v2 ignore entries and the long
 * "shared globals" block that existed for the split vanilla-JS client are gone
 * together with those directories.
 */
export default [
  {
    ignores: [
      "dist/**",
      ".test-build/**",
      "node_modules/**",
      ".prism-previews/**",
      ".design/**",
      "test-results/**",
      "prism-ui-design-mcp/**",
      ".dsh-plugin-inspect/**",
      // The DSH plugin's packaged server copy (dsh-plugin/scripts/copy-server.mjs).
      "dsh-plugin/server/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
  {
    files: ["**/*.ts"],
    languageOptions: {
      globals: globals.node,
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "no-unused-vars": "off",
      "no-empty": "warn",
      "no-useless-escape": "warn",
    },
  },
  {
    files: ["**/*.mjs", "**/*.js"],
    languageOptions: {
      globals: globals.node,
    },
    rules: {
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
      "no-empty": "warn",
    },
  },
  {
    // Browser-driven scripts: these drive a headless browser and query the
    // rendered DOM, so their page.evaluate() callbacks run with browser globals.
    files: ["showcase.mjs", "audit-rendered-css.mjs", "survey-types.mjs", "verify-components.mjs"],
    languageOptions: {
      globals: { ...globals.node, ...globals.browser },
    },
  },
  {
    // The DSH Client half runs in the Harness web page, not in Node.
    files: ["dsh-plugin/client.js"],
    languageOptions: {
      globals: { ...globals.browser },
    },
  },
];
