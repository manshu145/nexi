import { z } from 'zod';
import { emailSchema, examSlugSchema, indianPhoneSchema } from './common.js';

export const CLASS_LEVELS = [
  'class-5', 'class-6', 'class-7', 'class-8', 'class-9', 'class-10',
  'class-11', 'class-12', 'graduation', 'post-graduation',
] as const;

export const BOARDS = [
  'cbse', 'icse', 'up-board', 'mp-board', 'bihar-board',
  'rajasthan-board', 'jharkhand-board', 'chhattisgarh-board',
  'uttarakhand-board', 'haryana-board', 'hp-board', 'jk-board',
  'state-other', 'not-applicable',
] as const;

export const onboardingRequestSchema = z.object({
  name: z.string().trim().min(1).max(100),
  targetExam: examSlugSchema,
  preferredLanguage: z.string().min(2).max(5).default('en'),
  classLevel: z
    .enum(CLASS_LEVELS)
    .nullable()
    .default(null),
  board: z.enum(BOARDS).nullable().default(null),
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
  /** Student's aim / career goal */
  aim: z.string().trim().max(300).nullable().default(null),
  /** List of exams the student is preparing for (beyond primary targetExam) */
  preparingExams: z.array(examSlugSchema).max(5).default([]),
  /** Onboarding version — used to force re-onboarding when new fields added */
  onboardingVersion: z.number().int().default(2),
});

export type OnboardingRequest = z.infer<typeof onboardingRequestSchema>;
