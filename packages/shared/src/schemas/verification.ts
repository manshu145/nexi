import { z } from 'zod';
import { userIdSchema } from './common.js';

export const documentTypeSchema = z.enum([
  'class_10_marksheet',
  'class_12_marksheet',
  'school_id',
  'admit_card',
  'graduation_marksheet',
  'other',
]);

/** Initiate a verification by getting a signed URL to upload to. */
export const startVerificationRequestSchema = z.object({
  documentType: documentTypeSchema,
  filename: z.string().trim().min(1).max(255),
  /** Bytes -- enforced server-side too. */
  byteSize: z
    .number()
    .int()
    .positive()
    .max(10 * 1024 * 1024, 'max upload is 10 MB'),
  mimeType: z.string().regex(/^(image\/(jpe?g|png|webp|heic)|application\/pdf)$/, {
    message: 'must be an image (jpg, png, webp, heic) or pdf',
  }),
});

/** Admin decision payload from the moderation queue. */
export const adminDecisionRequestSchema = z.object({
  verificationId: z.string().min(1),
  approve: z.boolean(),
  reason: z.string().trim().max(500).nullable().default(null),
});

/** Admin search filters for the verification queue. */
export const verificationListQuerySchema = z.object({
  status: z
    .enum(['pending', 'auto_approved', 'queued', 'approved', 'rejected', 'expired'])
    .default('queued'),
  userId: userIdSchema.optional(),
  /** Cursor for pagination, opaque to the client. */
  cursor: z.string().max(256).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export type StartVerificationRequest = z.infer<typeof startVerificationRequestSchema>;
export type AdminDecisionRequest = z.infer<typeof adminDecisionRequestSchema>;
export type VerificationListQuery = z.infer<typeof verificationListQuerySchema>;
