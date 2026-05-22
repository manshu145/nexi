/**
 * @nexigrate/credits
 *
 * Pure credit-economy engine. See ./engine.ts for the core API. The package
 * deliberately knows nothing about Firestore, HTTP, or any specific
 * persistence layer -- those concerns live in @nexigrate/api.
 */
export * from './engine.js';
export * from './errors.js';
