import { z } from 'zod';
import { examSlugSchema, safeStringSchema } from './common.js';

/**
 * Zod schemas for the `chapters` collection.
 *
 * Used at trust boundaries: `POST /v1/admin/chapters` and
 * `PATCH /v1/admin/chapters/:id` validate against these. The frontend
 * imports the inferred types so the admin form and the server stay in
 * lockstep.
 */

export const chapterSlugSchema = z
  .string()
  .trim()
  .min(2)
  .max(80)
  .regex(/^[a-z][a-z0-9-]*$/, {
    message: 'must be a kebab-case slug starting with a letter',
  });

export const subjectSlugSchema = z
  .string()
  .trim()
  .min(2)
  .max(40)
  .regex(/^[a-z][a-z0-9-]*$/, {
    message: 'must be a kebab-case slug starting with a letter',
  });

export const classLevelSchema = z
  .enum(['class-8', 'class-9', 'class-10', 'class-11', 'class-12', 'graduation', 'post-graduation'])
  .nullable()
  .default(null);

export const chapterSectionSchema = z.object({
  heading: z.string().trim().min(1).max(200),
  /**
   * Markdown body. Generous max length -- a long chapter section is
   * still under ~5000 chars; capping at 20000 leaves headroom without
   * letting someone DOS the doc with a 500KB body.
   */
  body: safeStringSchema.refine((s) => s.length >= 1 && s.length <= 20000, {
    message: 'section body must be 1-20000 chars',
  }),
});

/**
 * Schema for the create + update bodies of `/v1/admin/chapters`.
 *
 * `id` is computed by the server from `{exam}-{subject}-{chapterSlug}`,
 * so the client cannot set it. `status` defaults to 'draft' on create
 * and is changed only via the publish/archive endpoints.
 */
export const chapterUpsertSchema = z.object({
  exam: examSlugSchema,
  subject: subjectSlugSchema,
  chapterSlug: chapterSlugSchema,
  title: z.string().trim().min(2).max(200),
  summary: z.string().trim().min(2).max(400),
  classLevel: classLevelSchema,
  sections: z
    .array(chapterSectionSchema)
    .min(1, { message: 'at least one section is required' })
    .max(40, { message: 'no more than 40 sections per chapter' }),
  source: z.string().trim().min(2).max(300),
  order: z.number().int().min(0).max(99999).default(1000),
});

export type ChapterUpsertRequest = z.infer<typeof chapterUpsertSchema>;
