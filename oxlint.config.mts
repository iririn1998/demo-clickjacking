import { defineConfig } from "oxlint";

export default defineConfig({
  plugins: ["typescript", "oxc"],
  rules: {
    "prefer-arrow-callback": "error",
    "func-style": ["error", "expression", { allowArrowFunctions: true }],
    "typescript/consistent-type-definitions": ["error", "type"],
  },
});
