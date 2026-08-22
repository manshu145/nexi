import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'shared',
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      // Only the jobs domain logic carries behaviour worth covering; the rest
      // of this package is types, Zod schemas and constant tables.
      include: ['src/jobs/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/jobs/index.ts'],
      thresholds: {
        statements: 85,
        branches: 80,
        functions: 85,
        lines: 85,
      },
    },
  },
});
