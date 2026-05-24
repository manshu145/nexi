import {
  asISODateTime,
  CURRENT_AFFAIRS_CATEGORIES,
  isExamSlug,
  type CurrentAffairsCategory,
  type CurrentAffairsDigestDraft,
  type CurrentAffairsItem,
  type CurrentAffairsVerifierScore,
  type ExamSlug,
  type ISODateTime,
} from '@nexigrate/shared';
import type { LLMClient } from '../llm/index.js';
import { safeParseLlmJson } from '../llm/parseJson.js';
import {
  currentAffairsGenerationSystem,
  currentAffairsGenerationUser,
  currentAffairsVerificationSystem,
  currentAffairsVerificationUser,
  type CurrentAffairsGenerationContext,
} from './prompts.js';

/**
 * 3-AI current-affairs digest orchestrator.
 *
 * Mirrors apps/api/src/lib/nexipediaGen/generate.ts, but the verifier
 * rubric weights `neutrality` instead of `structure` -- a current-
 * affairs digest can be terse and still excellent, but partisan framing
 * is a kill-flag in this domain.
 */

export interface GenerateCurrentAffairsInput {
  date: string;
  context: CurrentAffairsGenerationContext;
  generator: LLMClient;
  verifiers: [LLMClient, LLMClient];
  now?: () => ISODateTime;
  newId?: () => string;
}

interface RawDigestJson {
  summary: string;
  items: {
    id?: string;
    headline: string;
    body: string;
    category: string;
    sources?: string[];
    relevantExams?: string[];
    tags?: string[];
  }[];
}

interface VerifyDigestJson {
  agreesAccurate: boolean;
  factualAccuracy: number;
  neutrality: number;
  clarity: number;
  reasoning: string;
  factualErrors?: string[];
}

function isValidDigestJson(d: unknown): d is RawDigestJson {
  if (typeof d !== 'object' || d === null) return false;
  const o = d as Record<string, unknown>;
  if (typeof o['summary'] !== 'string' || o['summary'].trim().length < 5) return false;
  const items = o['items'];
  if (!Array.isArray(items) || items.length < 1 || items.length > 25) return false;
  for (const it of items as unknown[]) {
    if (typeof it !== 'object' || it === null) return false;
    const io = it as Record<string, unknown>;
    if (typeof io['headline'] !== 'string' || io['headline'].trim().length < 5) return false;
    if (typeof io['body'] !== 'string' || io['body'].trim().length < 20) return false;
    if (typeof io['category'] !== 'string') return false;
  }
  return true;
}

function isValidVerifyJson(d: unknown): d is VerifyDigestJson {
  if (typeof d !== 'object' || d === null) return false;
  const o = d as Record<string, unknown>;
  if (typeof o['agreesAccurate'] !== 'boolean') return false;
  for (const k of ['factualAccuracy', 'neutrality', 'clarity'] as const) {
    if (typeof o[k] !== 'number' || (o[k] as number) < 0 || (o[k] as number) > 1) {
      return false;
    }
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
      .slice(0, 64) || 'item'
  );
}

function isCategory(s: string): s is CurrentAffairsCategory {
  return (CURRENT_AFFAIRS_CATEGORIES as readonly string[]).includes(s);
}

export interface GenerateCurrentAffairsResult {
  draft: CurrentAffairsDigestDraft;
  verifierDisagreement: boolean;
}

export async function generateCurrentAffairsDigest(
  input: GenerateCurrentAffairsInput,
): Promise<GenerateCurrentAffairsResult> {
  const now = input.now ?? (() => asISODateTime(new Date().toISOString()));
  const newId =
    input.newId ??
    (() => `ca_d_${globalThis.crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`);

  // 1. Generate
  const genResp = await input.generator.complete({
    promptName: 'current_affairs.generate',
    system: currentAffairsGenerationSystem(),
    user: currentAffairsGenerationUser(input.context),
    json: true,
    temperature: 0.3,
    maxTokens: 6000,
  });
  const raw = safeParseLlmJson<RawDigestJson>(genResp.content);
  if (!raw || !isValidDigestJson(raw)) {
    throw new Error(
      `[current-affairs] generator (${input.generator.providerId}) returned malformed JSON: ${genResp.content.slice(0, 200)}`,
    );
  }

  // Normalise items
  const items: CurrentAffairsItem[] = raw.items.map((it, i) => {
    const cat: CurrentAffairsCategory = isCategory(it.category) ? it.category : 'other';
    const exams: ExamSlug[] = Array.isArray(it.relevantExams)
      ? (it.relevantExams.filter((e) => typeof e === 'string' && isExamSlug(e)) as ExamSlug[])
      : [];
    return {
      id: it.id?.trim() ? slugify(it.id) : slugify(it.headline) || `item-${i + 1}`,
      headline: it.headline.trim(),
      body: it.body.trim(),
      category: cat,
      sources: Array.isArray(it.sources)
        ? it.sources.filter((s) => typeof s === 'string' && s.trim().length > 0).slice(0, 6)
        : [],
      relevantExams: exams,
      tags: Array.isArray(it.tags)
        ? (it.tags.filter((t) => typeof t === 'string') as string[])
            .map((t) => t.toLowerCase().trim())
            .filter((t) => t.length > 0)
            .slice(0, 8)
        : [],
    };
  });

  const id = `ca_${input.date}` as CurrentAffairsDigestDraft['id'];
  const ts = now();

  // 2 + 3. Verify in parallel
  const verifyPayload = {
    date: input.date,
    summary: raw.summary.trim(),
    items: items.map((i) => ({
      headline: i.headline,
      body: i.body,
      category: i.category,
      sources: i.sources,
    })),
  };
  const verifyResults = await Promise.all(
    input.verifiers.map(async (v) => {
      try {
        const resp = await v.complete({
          promptName: 'current_affairs.verify',
          system: currentAffairsVerificationSystem(),
          user: currentAffairsVerificationUser(verifyPayload),
          json: true,
          temperature: 0.2,
          maxTokens: 2000,
        });
        const parsed = safeParseLlmJson<VerifyDigestJson>(resp.content);
        if (!parsed || !isValidVerifyJson(parsed)) {
          return {
            providerId: v.providerId,
            modelId: v.modelId,
            agreesAccurate: false,
            factualAccuracy: 0,
            neutrality: 0,
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
          neutrality: parsed.neutrality,
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
          neutrality: 0,
          clarity: 0,
          factualErrors: [
            `verifier call failed: ${e instanceof Error ? e.message : 'unknown'}`,
          ],
          reasoning: `verifier call failed: ${e instanceof Error ? e.message : 'unknown'}`,
        };
      }
    }),
  );

  const verifierScores: CurrentAffairsVerifierScore[] = verifyResults.map((r) => ({
    modelId: r.modelId,
    factualAccuracy: r.factualAccuracy,
    neutrality: r.neutrality,
    clarity: r.clarity,
    agreesAccurate: r.agreesAccurate,
    reasoning: r.reasoning,
    factualErrors: r.factualErrors,
    passedAt: ts,
  }));

  const meanPerVerifier = verifyResults.map(
    (r) => (r.factualAccuracy + r.neutrality + r.clarity) / 3,
  );
  const overallMean = (meanPerVerifier[0]! + meanPerVerifier[1]!) / 2;
  const bothAgreed =
    verifyResults[0]!.agreesAccurate && verifyResults[1]!.agreesAccurate;
  const verificationScore = bothAgreed ? overallMean : Math.min(overallMean, 0.4);
  const verifierDisagreement =
    verifyResults[0]!.agreesAccurate !== verifyResults[1]!.agreesAccurate;
  // Capture random id to keep references stable for tests/repro.
  void newId;

  const draft: CurrentAffairsDigestDraft = {
    id,
    date: input.date,
    summary: raw.summary.trim(),
    items,
    generatedBy: input.generator.modelId,
    verifiers: verifierScores,
    verificationScore,
    status: 'pending',
    reviewedBy: null,
    reviewedAt: null,
    rejectionReason: null,
    rawNotes: input.context.rawNotes,
    createdAt: ts,
    updatedAt: ts,
  };

  return { draft, verifierDisagreement };
}

/** IST date helper used by the route to default to "today" when admin omits. */
export function todayIstDate(): string {
  const now = new Date();
  // IST = UTC+5:30
  const ist = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
  return ist.toISOString().slice(0, 10);
}
