import js from "@eslint/js";
import globals from "globals";

export default [
  {
    ignores: [
      ".output/",
      ".wxt/",
      "coverage/",
      "node_modules/",
      "**/*.{ts,tsx}",
    ],
  },
  js.configs.recommended,
  {
    files: ["**/*.{js,mjs}"],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
  },
];
