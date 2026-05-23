import { z } from 'zod';
import { emailSchema, examSlugSchema, indianPhoneSchema } from './common.js';

/**
 * Common Indian-curriculum subjects offered as a checkbox set on the
 * "weak subjects" survey question. The list is the union of school
 * (CBSE/ICSE/state board) + entrance-exam (JEE/NEET) subject names a
 * student is most likely to recognise. Free-text additions get appended
 * verbatim to `weakSubjects`.
 */
export const COMMON_SUBJECTS = [
  'Physics',
  'Chemistry',
  'Biology',
  'Mathematics',
  'English',
  'Hindi',
  'Social Studies',
  'History',
  'Geography',
  'Civics',
  'Economics',
  'Computer Science',
  'Accountancy',
  'Business Studies',
  'Sanskrit',
] as const;

export const onboardingRequestSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
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
  /**
   * Phase 8 survey additions. These augment the existing StudentProfile
   * fields (which were already collected in the schema but never persisted
   * end-to-end) with the three habit/goal questions the founder wants for
   * personalisation downstream:
   *
   *   examDate            -- expected attempt date (drives countdown UI)
   *   studyHoursPerDay    -- self-reported daily availability
   *   weakSubjects        -- checkbox + free-text list of subjects the
   *                          student wants the most help with
   *   phone               -- the student's own phone (separate from the
   *                          parental fields below). Optional. Stored on
   *                          User.phone so it merges cleanly with the
   *                          existing schema.
   */
  examDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'must be YYYY-MM-DD')
    .nullable()
    .default(null),
  studyHoursPerDay: z.number().int().min(0).max(16).nullable().default(null),
  weakSubjects: z
    .array(z.string().trim().min(1).max(40))
    .max(8, { message: 'pick at most 8 weak subjects' })
    .default([]),
  phone: indianPhoneSchema.nullable().default(null),

  parentEmail: emailSchema.nullable().default(null),
  parentPhone: indianPhoneSchema.nullable().default(null),
  /** Referral code that pulled this user in, if any. */
  referralCode: z.string().trim().min(4).max(20).nullable().default(null),
});

export type OnboardingRequest = z.infer<typeof onboardingRequestSchema>;
