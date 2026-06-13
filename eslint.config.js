import js from "@eslint/js"
import tseslint from "@typescript-eslint/eslint-plugin"
import tsparser from "@typescript-eslint/parser"
import vuePlugin from "eslint-plugin-vue"
import prettier from "eslint-config-prettier"

export default [
  js.configs.recommended,
  ...vuePlugin.configs["flat/recommended"],
  prettier,
  {
    files: ["**/*.{ts,vue}"],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
      },
    },
    plugins: {
      "@typescript-eslint": tseslint,
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      "no-empty": "error",
      "no-console": ["warn", { allow: ["warn", "error"] }],
      "prefer-const": "error",
      "no-var": "error",
      "vue/multi-word-component-names": "off",
    },
  },
  {
    ignores: ["**/dist/**", "**/node_modules/**", "**/target/**", "**/*.js"],
  },
]
