import js from "@eslint/js";
import globals from "globals";

export default [
  {
    ignores: [
      "logs/**",
      "node_modules/**",
      ".git/**",
    ],
  },
  js.configs.recommended,
  {
    files: ["scripts/**/*.mjs", "tests/**/*.mjs"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: globals.node,
    },
    rules: {
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
    },
  },
  {
    files: ["behavior_packs/**/scripts/**/*.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        ...globals.es2021,
        console: "readonly",
        world: "readonly",
        system: "readonly",
        ItemStack: "readonly",
        WeatherType: "readonly",
        DisplaySlotId: "readonly",
        globalThis: "readonly",
      },
    },
    rules: {
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
      "no-redeclare": "error",
      "no-dupe-keys": "error",
      "no-undef": "off",
    },
  },
];
