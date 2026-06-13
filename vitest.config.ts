import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['packages/**/src/**/*.test.ts', 'apps/gui/src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: [
        'packages/core/src/**/*.ts',
        'apps/gui/src/stores/**/*.ts',
        'apps/gui/src/composables/**/*.ts',
      ],
      exclude: [
        '**/__tests__/**',
        '**/*.test.ts',
        '**/node_modules/**',
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
