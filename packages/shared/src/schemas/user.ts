import { z } from 'zod';
import { emailSchema, examSlugSchema, indianPhoneSchema } from './common.js';

export const onboardingRequestSchema = z.object({
  name: z.string().trim().min(1).max(100),
  targetExam: examSlugSchema,
  classLevel: z
    .enum(['class-8', 'class-9', 'class-10', 'class-11', 'class-12', 'graduation', 'post-graduation'])
    .nullable()
    .default(null),
  board: z.enum(['cbse', 'icse', 'state', 'other']).nullable().default(null),
  schoolName: z.string().trim().max(200).nullable().default(null),
  district: z.string().trim().max(100).nullable().default(null),
  state: z.string().trim().max(100).nullable().default(null),
  /** YYYY-MM-DD; only required if the user is potentially a minor. */
  dateOfBirth: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'must be YYYY-MM-DD')
    .nullable()
    .default(null),
  parentEmail: emailSchema.nullable().default(null),
  parentPhone: indianPhoneSchema.nullable().default(null),
  /** Referral code that pulled this user in, if any. */
  referralCode: z.string().trim().min(4).max(20).nullable().default(null),
});

export type OnboardingRequest = z.infer<typeof onboardingRequestSchema>;
