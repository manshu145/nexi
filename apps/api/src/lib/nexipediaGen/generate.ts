import {
  asISODateTime,
  asNexipediaArticleId,
  NEXIPEDIA_CATEGORIES,
  type ExamSlug,
  type ISODateTime,
  type NexipediaArticleDraft,
  type NexipediaCategory,
  type NexipediaSection,
  type NexipediaVerifierScore,
} from '@nexigrate/shared';
import type { LLMClient } from '../llm/index.js';
import {
  nexipediaGenerationSystem,
  nexipediaGenerationUser,
  nexipediaVerificationSystem,
  nexipediaVerificationUser,
  type NexipediaGenerationContext,
} from './prompts.js';

/**
 * 3-AI orchestrator for Nexipedia article generation.
 *
 * Identical control flow to chapterGen/generate.ts: a generator emits a
 * full article in JSON, two verifiers score it independently, the result
 * is combined into a draft. Disagreement on agreesAccurate caps the
 * combined verificationScore at 0.4 to force admin review.
 *
 * The verifier rubric here weights factualAccuracy + structure + clarity
 * (chapters use factualAccuracy + coverage + clarity). "Coverage" doesn't
 * apply -- a Nexipedia article is allowed to be narrow, as long as what
 * it does say is verifiable.
 */
export interface GenerateNexipediaArticleInput {
  slug: string;
  title: string;
  category: NexipediaCategory;
  context: NexipediaGenerationContext;
  generator: LLMClient;
  verifiers: [LLMClient, LLMClient];
  now?: () => ISODateTime;
  newId?: () => string;
}

interface RawArticleJson {
  title: string;
  summary: string;
  sections: { id?: string; heading: string; body: string; order?: number }[];
  estimatedReadMinutes?: number;
  source?: string;
  relatedExams?: string[];
}

interface VerifyArticleJson {
  agreesAccurate: boolean;
  factualAccuracy: number;
  structure: number;
  clarity: number;
  reasoning: string;
  factualErrors?: string[];
}

const ALLOWED_EXAMS = new Set([
  'jee-main',
  'jee-advanced',
  'neet-ug',
  'class-11-cbse',
  'class-12-cbse',
  'upsc',
  'ssc',
]);

function tryParseJson<T>(s: string): T | null {
  const stripped = s
    .replace(/^\s*```json\s*/i, '')
    .replace(/^\s*```\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim();
  try {
    return JSON.parse(stripped) as T;
  } catch {
    return null;
  }
}

function isValidArticleJson(d: unknown): d is RawArticleJson {
  if (typeof d !== 'object' || d === null) return false;
  const o = d as Record<string, unknown>;
  if (typeof o['title'] !== 'string' || o['title'].trim().length < 3) return false;
  if (typeof o['summary'] !== 'string' || o['summary'].trim().length < 10) return false;
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

function isValidVerifyJson(d: unknown): d is VerifyArticleJson {
  if (typeof d !== 'object' || d === null) return false;
  const o = d as Record<string, unknown>;
  if (typeof o['agreesAccurate'] !== 'boolean') return false;
  for (const k of ['factualAccuracy', 'structure', 'clarity'] as const) {
    if (typeof o[k] !== 'number' || (o[k] as number) < 0 || (o[k] as number) > 1) return false;
  }
  if (typeof o['reasoning'] !== 'string') return false;
  return true;
}

function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 64) || 'section'
  );
}

/**
 * Compute the search tokens used by the substring-search endpoint. Lowercase,
 * deduplicated, words-only. Capped to 64 tokens to keep doc size predictable.
 */
function makeSearchTokens(
  title: string,
  summary: string,
  category: NexipediaCategory,
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const push = (raw: string) => {
    for (const word of raw.toLowerCase().split(/[^a-z0-9]+/)) {
      if (word.length < 3) continue;
      if (seen.has(word)) continue;
      seen.add(word);
      out.push(word);
      if (out.length >= 64) return;
    }
  };
  push(title);
  push(summary);
  push(category);
  return out;
}

export interface GenerateNexipediaArticleResult {
  draft: NexipediaArticleDraft;
  verifierDisagreement: boolean;
}

export async function generateNexipediaArticle(
  input: GenerateNexipediaArticleInput,
): Promise<GenerateNexipediaArticleResult> {
  const now = input.now ?? (() => asISODateTime(new Date().toISOString()));
  const newId =
    input.newId ??
    (() => `nex_d_${globalThis.crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`);

  // Sanity: category must be in the allowed set (defensive against caller bugs).
  if (!(NEXIPEDIA_CATEGORIES as readonly string[]).includes(input.category)) {
    throw new Error(`[nexipedia-gen] unknown category: ${input.category}`);
  }

  // 1. Generate
  const genResp = await input.generator.complete({
    promptName: 'nexipedia.generate',
    system: nexipediaGenerationSystem(),
    user: nexipediaGenerationUser(input.context),
    json: true,
    temperature: 0.4,
    maxTokens: 5000,
  });
  const raw = tryParseJson<RawArticleJson>(genResp.content);
  if (!raw || !isValidArticleJson(raw)) {
    throw new Error(
      `[nexipedia-gen] generator (${input.generator.providerId}) returned malformed JSON: ${genResp.content.slice(0, 200)}`,
    );
  }

  const sections: NexipediaSection[] = raw.sections.map((s, i) => ({
    id: s.id?.trim() ? slugify(s.id) : slugify(s.heading) || `section-${i + 1}`,
    heading: s.heading.trim(),
    body: s.body.trim(),
    order: typeof s.order === 'number' && s.order > 0 ? s.order : i + 1,
  }));

  const ts = now();
  const id = asNexipediaArticleId(newId());
  const source =
    raw.source?.trim() || input.context.sourceHint || 'AI-generated Nexipedia draft';
  const estimatedReadMinutes =
    typeof raw.estimatedReadMinutes === 'number' && raw.estimatedReadMinutes > 0
      ? Math.min(60, Math.round(raw.estimatedReadMinutes))
      : Math.max(3, Math.round(sections.reduce((acc, s) => acc + s.body.length, 0) / 1200));

  const relatedExams: ExamSlug[] = Array.isArray(raw.relatedExams)
    ? (raw.relatedExams.filter(
        (e) => typeof e === 'string' && ALLOWED_EXAMS.has(e),
      ) as ExamSlug[])
    : [];

  // 2 + 3. Verify in parallel.
  const verifyPayload = {
    slug: input.slug,
    title: raw.title.trim(),
    summary: raw.summary.trim(),
    category: input.category,
    source,
    sections,
  };
  const verifyResults = await Promise.all(
    input.verifiers.map(async (v) => {
      try {
        const resp = await v.complete({
          promptName: 'nexipedia.verify',
          system: nexipediaVerificationSystem(),
          user: nexipediaVerificationUser(verifyPayload),
          json: true,
          temperature: 0.2,
          maxTokens: 800,
        });
        const parsed = tryParseJson<VerifyArticleJson>(resp.content);
        if (!parsed || !isValidVerifyJson(parsed)) {
          return {
            providerId: v.providerId,
            modelId: v.modelId,
            agreesAccurate: false,
            factualAccuracy: 0,
            structure: 0,
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
          structure: parsed.structure,
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
          structure: 0,
          clarity: 0,
          factualErrors: [
            `verifier call failed: ${e instanceof Error ? e.message : 'unknown'}`,
          ],
          reasoning: `verifier call failed: ${e instanceof Error ? e.message : 'unknown'}`,
        };
      }
    }),
  );

  const verifiers: NexipediaVerifierScore[] = verifyResults.map((r) => ({
    modelId: r.modelId,
    factualAccuracy: r.factualAccuracy,
    structure: r.structure,
    clarity: r.clarity,
    agreesAccurate: r.agreesAccurate,
    reasoning: r.reasoning,
    factualErrors: r.factualErrors,
    passedAt: ts,
  }));

  const meanPerVerifier = verifyResults.map(
    (r) => (r.factualAccuracy + r.structure + r.clarity) / 3,
  );
  const overallMean = (meanPerVerifier[0]! + meanPerVerifier[1]!) / 2;
  const bothAgreed =
    verifyResults[0]!.agreesAccurate && verifyResults[1]!.agreesAccurate;
  const verificationScore = bothAgreed ? overallMean : Math.min(overallMean, 0.4);
  const verifierDisagreement =
    verifyResults[0]!.agreesAccurate !== verifyResults[1]!.agreesAccurate;

  const draft: NexipediaArticleDraft = {
    id,
    slug: input.slug,
    title: raw.title.trim(),
    summary: raw.summary.trim(),
    category: input.category,
    relatedExams,
    sections,
    estimatedReadMinutes,
    source,
    generatedBy: input.generator.modelId,
    verifiers,
    verificationScore,
    status: 'pending',
    reviewedBy: null,
    reviewedAt: null,
    rejectionReason: null,
    createdAt: ts,
    updatedAt: ts,
  };

  // searchTokens are stored on the published article, not the draft.
  // Computed at approve-time; we don't need them on the draft path.
  void makeSearchTokens; // silence unused-import warning for the export

  return { draft, verifierDisagreement };
}

export { makeSearchTokens };
