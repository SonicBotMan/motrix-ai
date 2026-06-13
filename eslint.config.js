import js from "@eslint/js"
import tseslint from "@typescript-eslint/eslint-plugin"
import tsparser from "@typescript-eslint/parser"
import vuePlugin from "eslint-plugin-vue"
import prettier from "eslint-config-prettier"

const sharedGlobals = {
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
  RequestInit: "readonly",
  Headers: "readonly",
  Blob: "readonly",
  BlobPart: "readonly",
  ReadableStream: "readonly",
  WritableStream: "readonly",
  TransformStream: "readonly",
  structuredClone: "readonly",
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
  KeyboardEvent: "readonly",
  HTMLInputElement: "readonly",
  DragEvent: "readonly",
  Event: "readonly",
  HTMLElement: "readonly",
}

const sharedRules = {
  "no-unused-vars": "off",
  "@typescript-eslint/no-unused-vars": ["error", {
    argsIgnorePattern: "^_",
    varsIgnorePattern: "^_",
    caughtErrorsIgnorePattern: "^_",
  }],
  "@typescript-eslint/no-explicit-any": "error",
  "no-empty": "error",
  "no-console": ["warn", { allow: ["warn", "error"] }],
  "prefer-const": "error",
  "no-var": "error",
  "vue/multi-word-component-names": "off",
}

const testGlobals = {
  describe: "readonly",
  it: "readonly",
  expect: "readonly",
  vi: "readonly",
  beforeEach: "readonly",
  afterEach: "readonly",
  beforeAll: "readonly",
  afterAll: "readonly",
}

export default [
  js.configs.recommended,
  ...vuePlugin.configs["flat/recommended"],
  prettier,
  {
    files: ["**/*.ts"],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
      },
      globals: { ...sharedGlobals, ...testGlobals },
    },
    plugins: {
      "@typescript-eslint": tseslint,
    },
    rules: { ...sharedRules },
  },
  {
    files: ["**/*.vue"],
    languageOptions: {
      parserOptions: {
        parser: tsparser,
        ecmaVersion: "latest",
        sourceType: "module",
      },
      globals: { ...sharedGlobals },
    },
    plugins: {
      "@typescript-eslint": tseslint,
    },
    rules: { ...sharedRules },
  },
  {
    ignores: ["**/dist/**", "**/node_modules/**", "**/target/**", "**/*.js", "**/*.mjs"],
  },

  // CLI commands use console.log for user-facing output.
  // This is intentional — the CLI is a terminal tool that prints to stdout.
  {
    files: ["packages/cli/**/*.ts"],
    rules: {
      "no-console": "off",
    },
  },
]
