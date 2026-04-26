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
    "node/no-unsupported-features/es-syntax": "off",
    "node/no-unpublished-require": "off",
    "node/no-extraneous-require": "off",
    "node/no-missing-require": "error",

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
    {
      files: ["public/scripts/**/*.js"],
      env: { browser: true, node: false },
      rules: {
        "node/no-missing-require": "off",
        "no-console": "off",
      },
    },
    {
      files: ["tests/**/*.js"],
      env: { jest: true },
    },
    // Migration, seed, and standalone scripts — console + process.exit are intentional
    {
      files: ["scripts/**/*.js", "server/db/**/*.js"],
      rules: {
        "no-console": "off",
        "no-process-exit": "off",
      },
    },
    // Server entry point — process.exit is intentional for fatal startup errors
    {
      files: ["server/app.js"],
      rules: {
        "no-process-exit": "off",
        "no-console": "off",
      },
    },
  ],
};
