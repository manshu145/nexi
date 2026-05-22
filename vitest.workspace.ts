import { defineWorkspace } from 'vitest/config';

/**
 * Vitest workspace config. Each entry is a glob that points at a package.
 * Vitest discovers test files inside each, applying that package's local
 * config (or this file's defaults).
 *
 * Add new test-bearing packages here as they come online.
 */
export default defineWorkspace([
  'packages/credits',
  // 'packages/ai-pipeline',
  // 'apps/api',
]);
