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
      globals: {
        // Node.js globals
        console: "readonly",
        process: "readonly",
        setTimeout: "readonly",
        setInterval: "readonly",
        clearTimeout: "readonly",
        clearInterval: "readonly",
        Buffer: "readonly",
        __dirname: "readonly",
        __filename: "readonly",
        fetch: "readonly",
        URL: "readonly",
        URLSearchParams: "readonly",
        AbortSignal: "readonly",
        Response: "readonly",
        Request: "readonly",
        Headers: "readonly",
        RequestInit: "readonly",
        // Browser globals
        window: "readonly",
        document: "readonly",
        navigator: "readonly",
        localStorage: "readonly",
        sessionStorage: "readonly",
        alert: "readonly",
        confirm: "readonly",
        prompt: "readonly",
        location: "readonly",
        history: "readonly",
        Image: "readonly",
        FormData: "readonly",
        XMLHttpRequest: "readonly",
        WebSocket: "readonly",
        IntersectionObserver: "readonly",
        MutationObserver: "readonly",
        ResizeObserver: "readonly",
        requestAnimationFrame: "readonly",
        cancelAnimationFrame: "readonly",
        getComputedStyle: "readonly",
        matchMedia: "readonly",
        scrollTo: "readonly",
        scrollBy: "readonly",
        btoa: "readonly",
        atob: "readonly",
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
