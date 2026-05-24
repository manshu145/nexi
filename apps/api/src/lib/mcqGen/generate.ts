import {
  asISODateTime,
  asMcqId,
  type ExamSlug,
  type ISODateTime,
  type McqDifficulty,
  type McqDraft,
  type McqVerifierScore,
} from '@nexigrate/shared';
import type { LLMClient } from '../llm/index.js';
import {
  generationSystem,
  generationUser,
  verificationSystem,
  verificationUser,
  type GenerationContext,
} from './prompts.js';

/**
 * 3-AI MCQ generation orchestrator.
 *
 * Pipeline:
 *   1. generator.complete(generationPrompt) -> raw JSON candidate
 *   2. verifier1.complete(verificationPrompt) -> {agreesCorrect, score, reasoning}
 *   3. verifier2.complete(verificationPrompt) -> same
 *   4. combine into a McqDraft with status='pending', scores, and the
 *      generator-supplied content. SMEs see this in the admin queue.
 *
 * The generator and verifiers must be DIFFERENT model lineages -- two
 * gpt-4o-minis verifying each other tells us nothing because they share
 * training data biases.
 *
 * One draft per call. The admin endpoint loops to produce N drafts.
 */
export interface GenerateOneInput {
  exam: ExamSlug;
  subject: string;
  chapter: string;
  context: GenerationContext;
  generator: LLMClient;
  verifiers: [LLMClient, LLMClient];
  /** ISO datetime factory; injected for tests. */
  now?: () => ISODateTime;
  /** Random ID factory; injected for tests. */
  newId?: () => string;
}

interface RawDraftJson {
  question: string;
  options: { key: 'A' | 'B' | 'C' | 'D'; text: string }[];
  correctOption: 'A' | 'B' | 'C' | 'D';
  explanation: string;
  source?: string;
}

interface VerifyJson {
  agreesCorrect: boolean;
  score: number;
  reasoning: string;
  suggestedFix?: { correctOption: 'A' | 'B' | 'C' | 'D'; why: string } | null;
}

const KEYS = ['A', 'B', 'C', 'D'] as const;

// Robust JSON parser that handles markdown fences and trailing commentary.
// See ../llm/parseJson.ts for the failure modes covered.
import { safeParseLlmJson as tryParseJson } from '../llm/parseJson.js';

function isValidDraftJson(d: unknown): d is RawDraftJson {
  if (typeof d !== 'object' || d === null) return false;
  const o = d as Record<string, unknown>;
  if (typeof o['question'] !== 'string' || o['question'].trim().length < 5) return false;
  if (typeof o['explanation'] !== 'string' || o['explanation'].trim().length < 5) return false;
  if (
    typeof o['correctOption'] !== 'string' ||
    !(KEYS as readonly string[]).includes(o['correctOption'] as string)
  )
    return false;
  const opts = o['options'];
  if (!Array.isArray(opts) || opts.length !== 4) return false;
  const seen = new Set<string>();
  for (const opt of opts as unknown[]) {
    if (typeof opt !== 'object' || opt === null) return false;
    const oo = opt as Record<string, unknown>;
    if (typeof oo['key'] !== 'string' || !(KEYS as readonly string[]).includes(oo['key'] as string))
      return false;
    if (typeof oo['text'] !== 'string' || oo['text'].trim().length === 0) return false;
    if (seen.has(oo['key'] as string)) return false;
    seen.add(oo['key'] as string);
  }
  if (seen.size !== 4) return false;
  return true;
}

function isValidVerifyJson(d: unknown): d is VerifyJson {
  if (typeof d !== 'object' || d === null) return false;
  const o = d as Record<string, unknown>;
  if (typeof o['agreesCorrect'] !== 'boolean') return false;
  if (typeof o['score'] !== 'number' || o['score'] < 0 || o['score'] > 1) return false;
  if (typeof o['reasoning'] !== 'string') return false;
  return true;
}

export interface GenerateOneResult {
  draft: McqDraft;
  /** Soft-disagreement signal -- true when the two verifiers diverged
   *  (one agreed, one didn't). UI surfaces this for SME triage. */
  verifierDisagreement: boolean;
}

export async function generateOne(input: GenerateOneInput): Promise<GenerateOneResult> {
  const now = input.now ?? (() => asISODateTime(new Date().toISOString()));
  const newId =
    input.newId ??
    (() => `mcq_d_${globalThis.crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`);

  // 1. Generate
  const genResp = await input.generator.complete({
    promptName: 'mcq.generate',
    system: generationSystem(),
    user: generationUser(input.context),
    json: true,
    temperature: 0.5,
    maxTokens: 800,
  });
  const rawDraft = tryParseJson<RawDraftJson>(genResp.content);
  if (!rawDraft || !isValidDraftJson(rawDraft)) {
    throw new Error(
      `[mcq-gen] generator (${input.generator.providerId}) returned malformed JSON: ${genResp.content.slice(0, 200)}`,
    );
  }

  const difficulty: McqDifficulty = input.context.difficulty;
  const id = asMcqId(newId());
  const ts = now();
  const source = rawDraft.source?.trim() || input.context.sourceHint || 'AI-generated draft';

  // 2 + 3. Verify in parallel.
  const verifyPayload = {
    question: rawDraft.question,
    options: rawDraft.options,
    correctOption: rawDraft.correctOption,
    explanation: rawDraft.explanation,
  };
  const verifyResults = await Promise.all(
    input.verifiers.map(async (v) => {
      try {
        const resp = await v.complete({
          promptName: 'mcq.verify',
          system: verificationSystem(),
          user: verificationUser(verifyPayload),
          json: true,
          temperature: 0.2,
          // Bumped from 400 -> 1200. The verifier writes out a structured
          // JSON object that includes a reasoning string and a list of
          // factualErrors; 400 tokens was hitting the limit mid-object,
          // which produced "malformed verifier output" flags on otherwise
          // good drafts. 1200 leaves headroom while staying cheap.
          maxTokens: 1200,
        });
        const parsed = tryParseJson<VerifyJson>(resp.content);
        if (!parsed || !isValidVerifyJson(parsed)) {
          // Treat malformed verifier output as a low-confidence fail rather
          // than crashing the whole draft.
          return {
            providerId: v.providerId,
            modelId: v.modelId,
            agreesCorrect: false,
            score: 0,
            reasoning: `verifier returned malformed JSON: ${resp.content.slice(0, 120)}`,
          };
        }
        return {
          providerId: v.providerId,
          modelId: v.modelId,
          agreesCorrect: parsed.agreesCorrect,
          score: parsed.score,
          reasoning: parsed.reasoning,
        };
      } catch (e) {
        return {
          providerId: v.providerId,
          modelId: v.modelId,
          agreesCorrect: false,
          score: 0,
          reasoning: `verifier call failed: ${e instanceof Error ? e.message : 'unknown'}`,
        };
      }
    }),
  );

  const verifierScores: McqVerifierScore[] = verifyResults.map((r) => ({
    modelId: r.modelId,
    score: r.score,
    reasoning: r.reasoning,
    passedAt: ts,
  }));

  // Combined score = mean of the two verifier scores. If both agree the
  // marked option is correct, multiply by 1; if they disagree among
  // themselves, halve to push the draft into manual review.
  const meanScore = (verifyResults[0]!.score + verifyResults[1]!.score) / 2;
  const bothAgreed =
    verifyResults[0]!.agreesCorrect && verifyResults[1]!.agreesCorrect;
  const verificationScore = bothAgreed ? meanScore : Math.min(meanScore, 0.4);
  const verifierDisagreement =
    verifyResults[0]!.agreesCorrect !== verifyResults[1]!.agreesCorrect;

  const draft: McqDraft = {
    id,
    exam: input.exam,
    subject: input.subject as McqDraft['subject'],
    chapter: input.chapter as McqDraft['chapter'],
    question: rawDraft.question,
    options: rawDraft.options,
    correctOption: rawDraft.correctOption,
    explanation: rawDraft.explanation,
    difficulty,
    source,
    verifiers: verifierScores,
    verificationScore,
    generatedBy: input.generator.modelId,
    status: 'pending',
    reviewedBy: null,
    reviewedAt: null,
    rejectionReason: null,
    createdAt: ts,
    updatedAt: ts,
  };

  return { draft, verifierDisagreement };
}
