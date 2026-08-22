import { z } from 'zod';
import { isoDateTimeSchema, userIdSchema } from './common.js';

/**
 * Wire-format Zod schemas for the credit ledger.
 * The TypeScript types in `../types/credit.ts` are the in-app shapes;
 * these schemas validate JSON crossing trust boundaries (HTTP, Pub/Sub).
 */

export const creditEarnSourceSchema = z.enum([
  'signup_verified',
  'daily_login',
  'chapter_complete',
  'mcq_pass',
  'mcq_fail_attempted',
  'streak_7d',
  'streak_30d',
  'referral_signup',
  'referral_retained_7d',
  'referral_bonus',
  'admin_grant',
  'subscription_grant',
]);

export const creditSpendReasonSchema = z.enum([
  'read_chapter',
  'focus_session_1h',
  'mock_test',
  'ai_tutor_question',
  'concept_video',
  'long_answer_grading',
  'admin_revoke',
]);

export const creditEventKindSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('earn'), source: creditEarnSourceSchema }),
  z.object({ kind: z.literal('spend'), reason: creditSpendReasonSchema }),
  z.object({ kind: z.literal('expire') }),
]);

export const creditEventSchema = z.object({
  id: z.string(),
  userId: userIdSchema,
  amount: z.number().int(),
  event: creditEventKindSchema,
  idempotencyKey: z.string().min(1).max(256),
  sourceRef: z.string().max(256).nullable(),
  occurredAt: isoDateTimeSchema,
  createdAt: isoDateTimeSchema,
  expiresAt: isoDateTimeSchema.nullable(),
});

export const awardCreditsRequestSchema = z.object({
  userId: userIdSchema,
  source: creditEarnSourceSchema,
  /** Override the configured amount; required for `admin_grant`/`subscription_grant`, ignored otherwise. */
  amountOverride: z.number().int().positive().optional(),
  sourceRef: z.string().max(256).nullable().default(null),
  idempotencyKey: z.string().min(1).max(256),
});

export const spendCreditsRequestSchema = z.object({
  userId: userIdSchema,
  reason: creditSpendReasonSchema,
  amountOverride: z.number().int().positive().optional(),
  sourceRef: z.string().max(256).nullable().default(null),
  idempotencyKey: z.string().min(1).max(256),
});

export type AwardCreditsRequest = z.infer<typeof awardCreditsRequestSchema>;
export type SpendCreditsRequest = z.infer<typeof spendCreditsRequestSchema>;
