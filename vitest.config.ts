// vitest.config.ts — Root-level Vitest configuration with coverage thresholds
//
// Runs all workspace test suites from a single entry point and enforces
// minimum coverage on the core package. GUI stores/composables are listed
// for future coverage tracking but excluded from threshold enforcement
// until corresponding tests are added.

import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['packages/**/src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: [
        'packages/core/src/**/*.ts',
        'apps/gui/src/stores/**/*.ts',
        'apps/gui/src/composables/**/*.ts',
      ],
      // Exclude GUI files from coverage measurement until tests exist.
      // Re-add them to the include list (and remove this exclude) once
      // GUI test suites are added.
      exclude: [
        '**/__tests__/**',
        '**/*.test.ts',
        '**/node_modules/**',
        'apps/gui/**',
      ],
      thresholds: {
        statements: 50,
        branches: 45,
        functions: 33,
        lines: 50,
      },
    },
  },
})
