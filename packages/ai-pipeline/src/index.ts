/**
 * @nexigrate/ai-pipeline
 *
 * Cross-model AI verification layer. Wraps a primary generator with a
 * second-model fact-checker, flags low-confidence outputs, and lets the
 * caller decide whether to regenerate or ship with a warning. Backs the
 * marketing "verified by 3-layer AI detection" claim:
 *
 *   Layer 1 -- primary generation (GPT-4o for chapters, varies by content type)
 *   Layer 2 -- this package: cross-check with a different provider
 *   Layer 3 -- existing aiEngine fallback chain on outright failure
 */

export type {
  ChapterVerificationContext,
  VerificationIssue,
  VerificationIssueKind,
  VerificationVerdict,
  VerifyChapterFn,
} from './types.js';

export { buildChapterVerifier, DEFAULT_CONFIDENCE_THRESHOLD } from './verifier.js';
