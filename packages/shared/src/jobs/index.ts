/**
 * Jobs & Eligibility — pure domain logic.
 *
 * Everything exported here is side-effect free: no Firestore, no network, no
 * LLM, no ambient clock. That is what lets the same engine run on the server
 * for the feed and in the browser for instant "why am I not eligible?"
 * feedback, and lets the whole rule surface be unit-tested exhaustively.
 */
export * from './age.js';
export * from './normalise.js';
export * from './eligibility.js';
export * from './fit.js';
