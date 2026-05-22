/**
 * @nexigrate/shared
 *
 * The single source of truth for types, Zod schemas, and constants used by
 * every other Nexigrate workspace package: api, web, mobile, admin,
 * ai-pipeline, credits, etc.
 *
 * Layout:
 *   - types/      pure TypeScript types (no runtime cost)
 *   - schemas/    Zod schemas for runtime validation at trust boundaries
 *   - constants/  immutable configuration tables (credit rates, exam catalog)
 *
 * Strict rules for this package:
 *   - No imports of platform-specific code (no firebase, no DOM, no React,
 *     no React Native, no node-only built-ins). It must run anywhere.
 *   - Public API is re-exported from this entry. Avoid deep imports.
 */
export * from './types/index.js';
export * from './schemas/index.js';
export * from './constants/index.js';
