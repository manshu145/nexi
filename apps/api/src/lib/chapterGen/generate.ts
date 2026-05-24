import {
  asISODateTime,
  type ChapterDraft,
  type ChapterSection,
  type ChapterVerifierScore,
  type ExamSlug,
  type ISODateTime,
} from '@nexigrate/shared';
import type { LLMClient } from '../llm/index.js';
import {
  chapterGenerationSystem,
  chapterGenerationUser,
  chapterVerificationSystem,
  chapterVerificationUser,
  type ChapterGenerationContext,
} from './prompts.js';

/**
 * 3-AI chapter generation orchestrator.
 *
 * Mirrors apps/api/src/lib/mcqGen/generate.ts:
 *   1. generator.complete(generationPrompt) -> raw JSON chapter
 *   2. verifier1.complete(verificationPrompt) -> {factualAccuracy, coverage,
 *      clarity, agreesAccurate, factualErrors, reasoning}
 *   3. verifier2.complete(verificationPrompt) -> same
 *   4. combine into a ChapterDraft with status='pending'
 *
 * The verifier scores three independent axes (factual / coverage / clarity)
 * because chapter content has more failure modes than a 4-option MCQ. We
 * average the three axes per verifier into a per-verifier mean, then
 * average the two verifiers. If the verifiers disagree on `agreesAccurate`
 * we cap the combined score at 0.4 to force admin review.
 */
export interface GenerateChapterInput {
  exam: ExamSlug;
  subject: string;
  /** Stable kebab-case slug used as the chapter id stem. */
  slug: string;
  classLevel: string;
  context: ChapterGenerationContext;
  generator: LLMClient;
  verifiers: [LLMClient, LLMClient];
  /** ISO datetime factory; injected for tests. */
  now?: () => ISODateTime;
  /** Random ID factory; injected for tests. */
  newId?: () => string;
}

interface RawChapterJson {
  title: string;
  summary: string;
  sections: { id?: string; heading: string; body: string; order?: number }[];
  estimatedReadMinutes?: number;
  source?: string;
}

interface VerifyChapterJson {
  agreesAccurate: boolean;
  factualAccuracy: number;
  coverage: number;
  clarity: number;
  reasoning: string;
  factualErrors?: string[];
}

// Robust JSON parser that handles markdown fences and trailing commentary.
// See ../llm/parseJson.ts for the failure modes covered.
import { safeParseLlmJson as tryParseJson } from '../llm/parseJson.js';

function isValidChapterJson(d: unknown): d is RawChapterJson {
  if (typeof d !== 'object' || d === null) return false;
  const o = d as Record<string, unknown>;
  if (typeof o['title'] !== 'string' || o['title'].trim().length < 3) return false;
  if (typeof o['summary'] !== 'string' || o['summary'].trim().length < 5) return false;
  const secs = o['sections'];
  if (!Array.isArray(secs) || secs.length < 2 || secs.length > 12) return false;
  for (const s of secs as unknown[]) {
    if (typeof s !== 'object' || s === null) return false;
    const so = s as Record<string, unknown>;
    if (typeof so['heading'] !== 'string' || so['heading'].trim().length < 1) return false;
    if (typeof so['body'] !== 'string' || so['body'].trim().length < 20) return false;
  }
  return true;
}

function isValidVerifyJson(d: unknown): d is VerifyChapterJson {
  if (typeof d !== 'object' || d === null) return false;
  const o = d as Record<string, unknown>;
  if (typeof o['agreesAccurate'] !== 'boolean') return false;
  for (const k of ['factualAccuracy', 'coverage', 'clarity'] as const) {
    if (typeof o[k] !== 'number' || (o[k] as number) < 0 || (o[k] as number) > 1) return false;
  }
  if (typeof o['reasoning'] !== 'string') return false;
  return true;
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64) || 'section';
}

export interface GenerateChapterResult {
  draft: ChapterDraft;
  /** True if the two verifiers disagreed on accuracy. UI surfaces this. */
  verifierDisagreement: boolean;
}

export async function generateChapter(
  input: GenerateChapterInput,
): Promise<GenerateChapterResult> {
  const now = input.now ?? (() => asISODateTime(new Date().toISOString()));
  const newId =
    input.newId ??
    (() => `chap_d_${globalThis.crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`);

  // 1. Generate
  const genResp = await input.generator.complete({
    promptName: 'chapter.generate',
    system: chapterGenerationSystem(),
    user: chapterGenerationUser(input.context),
    json: true,
    temperature: 0.5,
    // Chapter content is much longer than an MCQ; budget accordingly.
    // gpt-4o-mini supports up to 16k output, gemini-2.5-flash up to 8k.
    maxTokens: 6000,
  });
  const rawChapter = tryParseJson<RawChapterJson>(genResp.content);
  if (!rawChapter || !isValidChapterJson(rawChapter)) {
    throw new Error(
      `[chapter-gen] generator (${input.generator.providerId}) returned malformed JSON: ${genResp.content.slice(0, 200)}`,
    );
  }

  // Normalise sections (assign stable ids + order if generator skipped them)
  const sections: ChapterSection[] = rawChapter.sections.map((s, i) => ({
    id: s.id?.trim() ? slugify(s.id) : slugify(s.heading) || `section-${i + 1}`,
    heading: s.heading.trim(),
    body: s.body.trim(),
    order: typeof s.order === 'number' && s.order > 0 ? s.order : i + 1,
  }));

  const id = newId() as unknown as ChapterDraft['id'];
  const ts = now();
  const source =
    rawChapter.source?.trim() || input.context.sourceHint || 'AI-generated chapter draft';
  const estimatedReadMinutes =
    typeof rawChapter.estimatedReadMinutes === 'number' && rawChapter.estimatedReadMinutes > 0
      ? Math.min(60, Math.round(rawChapter.estimatedReadMinutes))
      : Math.max(5, Math.round(sections.reduce((acc, s) => acc + s.body.length, 0) / 1200));

  // 2 + 3. Verify in parallel
  const verifyPayload = {
    examName: input.context.examName,
    subject: input.context.subject,
    chapterTitle: input.context.chapterTitle,
    classLevel: input.context.classLevel,
    title: rawChapter.title.trim(),
    summary: rawChapter.summary.trim(),
    sections,
    source,
  };
  const verifyResults = await Promise.all(
    input.verifiers.map(async (v) => {
      try {
        const resp = await v.complete({
          promptName: 'chapter.verify',
          system: chapterVerificationSystem(),
          user: chapterVerificationUser(verifyPayload),
          json: true,
          temperature: 0.2,
          // Bumped from 800 -> 2000. Verifier outputs include a reasoning
          // string plus a factualErrors array; for a chapter-length input
          // the verifier often produced more issues than 800 tokens could
          // serialise, truncating the JSON and triggering a malformed-
          // output flag on otherwise valid drafts.
          maxTokens: 2000,
        });
        const parsed = tryParseJson<VerifyChapterJson>(resp.content);
        if (!parsed || !isValidVerifyJson(parsed)) {
          return {
            providerId: v.providerId,
            modelId: v.modelId,
            agreesAccurate: false,
            factualAccuracy: 0,
            coverage: 0,
            clarity: 0,
            factualErrors: [
              `verifier returned malformed JSON: ${resp.content.slice(0, 120)}`,
            ],
            reasoning: 'malformed verifier output',
          };
        }
        return {
          providerId: v.providerId,
          modelId: v.modelId,
          agreesAccurate: parsed.agreesAccurate,
          factualAccuracy: parsed.factualAccuracy,
          coverage: parsed.coverage,
          clarity: parsed.clarity,
          factualErrors: Array.isArray(parsed.factualErrors)
            ? parsed.factualErrors.filter((e) => typeof e === 'string')
            : [],
          reasoning: parsed.reasoning,
        };
      } catch (e) {
        return {
          providerId: v.providerId,
          modelId: v.modelId,
          agreesAccurate: false,
          factualAccuracy: 0,
          coverage: 0,
          clarity: 0,
          factualErrors: [
            `verifier call failed: ${e instanceof Error ? e.message : 'unknown'}`,
          ],
          reasoning: `verifier call failed: ${e instanceof Error ? e.message : 'unknown'}`,
        };
      }
    }),
  );

  const verifierScores: ChapterVerifierScore[] = verifyResults.map((r) => ({
    modelId: r.modelId,
    factualAccuracy: r.factualAccuracy,
    coverage: r.coverage,
    clarity: r.clarity,
    agreesAccurate: r.agreesAccurate,
    reasoning: r.reasoning,
    factualErrors: r.factualErrors,
    passedAt: ts,
  }));

  const meanPerVerifier = verifyResults.map(
    (r) => (r.factualAccuracy + r.coverage + r.clarity) / 3,
  );
  const overallMean = (meanPerVerifier[0]! + meanPerVerifier[1]!) / 2;
  const bothAgreed =
    verifyResults[0]!.agreesAccurate && verifyResults[1]!.agreesAccurate;
  const verificationScore = bothAgreed ? overallMean : Math.min(overallMean, 0.4);
  const verifierDisagreement =
    verifyResults[0]!.agreesAccurate !== verifyResults[1]!.agreesAccurate;

  const draft: ChapterDraft = {
    id,
    exam: input.exam,
    subject: input.subject,
    slug: input.slug,
    classLevel: input.classLevel,
    title: rawChapter.title.trim(),
    summary: rawChapter.summary.trim(),
    sections,
    estimatedReadMinutes,
    source,
    generatedBy: input.generator.modelId,
    verifiers: verifierScores,
    verificationScore,
    status: 'pending',
    reviewedBy: null,
    reviewedAt: null,
    rejectionReason: null,
    createdAt: ts,
    updatedAt: ts,
  };

  return { draft, verifierDisagreement };
}
