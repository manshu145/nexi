import { z } from 'zod';

/**
 * Shared Zod primitives.
 *
 * Use these instead of raw `z.string()` so that error messages and constraints
 * stay consistent across the codebase.
 */

export const isoDateTimeSchema = z
  .string()
  .datetime({ offset: true, message: 'must be an ISO-8601 datetime' });

export const userIdSchema = z.string().min(1).max(128);
export const examSlugSchema = z.string().min(2).max(64).regex(/^[a-z][a-z0-9-]*$/, {
  message: 'must be a kebab-case slug starting with a letter',
});

export const e164PhoneSchema = z
  .string()
  .regex(/^\+\d{8,15}$/, 'must be an E.164 phone number, e.g. +919876543210');

export const indianPhoneSchema = z
  .string()
  .regex(/^\+91\d{10}$/, 'must be an Indian phone number, e.g. +919876543210');

export const safeStringSchema = z
  .string()
  .max(2000)
  .refine((s) => !/[\u0000-\u0008\u000B-\u001F\u007F]/.test(s), {
    message: 'control characters are not allowed',
  });

/** Email, normalized to lowercase. */
export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email()
  .max(254);
