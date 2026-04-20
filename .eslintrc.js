"use strict";

module.exports = {
  root: true,
  env: {
    node: true,
    es2022: true,
  },
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: "module",
  },
  plugins: ["node"],
  extends: ["eslint:recommended", "plugin:node/recommended"],
  rules: {
    // ── Node-specific ──────────────────────────────────────
    "node/no-unsupported-features/es-syntax": "off", // we target Node 18+
    "node/no-unpublished-require": "off", // false positives on internal files
    "node/no-extraneous-require": "off", // handled by npm install instead
    "node/no-missing-require": "error",

    // ── Code quality ───────────────────────────────────────
    "no-unused-vars": [
      "error",
      { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
    ],
    "no-console": "warn",
    "no-var": "error",
    "prefer-const": "error",
    eqeqeq: ["error", "always"],
    curly: "error",
    "no-throw-literal": "error",
  },

  overrides: [
    // Frontend scripts use ES module syntax
    {
      files: ["public/scripts/**/*.js"],
      env: { browser: true, node: false },
      rules: {
        "node/no-missing-require": "off",
        "no-console": "off",
      },
    },
    // Test files
    {
      files: ["tests/**/*.js"],
      env: { jest: true },
    },
    // Build + migration + seed scripts — console and process.exit are fine here
    {
      files: ["scripts/**/*.js", "db/**/*.js"],
      rules: {
        "no-console": "off",
        "no-process-exit": "off",
      },
    },
    // Server entry point — process.exit is intentional for fatal startup errors
    {
      files: ["server.js"],
      rules: {
        "no-process-exit": "off",
        "no-console": "off",
      },
    },
  ],
};
