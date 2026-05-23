import { z } from 'zod';
import {
  type ChapterId,
  type DraftCandidate,
  type ExamSlug,
  type McqDifficulty,
  type McqDraft,
  type SubjectId,
  type UserId,
  type VerifierResult,
  asISODateTime,
  nowIso,
} from '@nexigrate/shared';
import type { LLMTriad } from '../llm/index.js';
import {
  buildGenerationUserPrompt,
  buildVerifierUserPrompt,
  MCQ_GEN_SYSTEM_PROMPT,
  VERIFIER_SYSTEM_PROMPT,
} from './prompts.js';

/**
 * MCQ generation orchestrator.
 *
 * Single public function: `generateMcqDraft(req, triad)` -- fans out to all
 * 3 primary LLMs in parallel, captures candidate outputs (or per-model
 * errors), then runs the verifier on the first successful candidate to
 * produce a SME-reviewable draft.
 *
 * Stays purely functional + deps-injected so tests use stub LLMs.
 */

// ---- Schemas (also exported as runtime validation contracts) ----

export const generationOutputSchema = z.object({
  question: z.string().min(8),
  options: z
    .array(
      z.object({
        key: z.enum(['A', 'B', 'C', 'D']),
        text: z.string().min(1),
      }),
    )
    .length(4),
  correctOption: z.enum(['A', 'B', 'C', 'D']),
  explanation: z.string().min(8),
  difficulty: z.enum(['easy', 'medium', 'hard']),
  reasoning: z.string().min(1),
});

export const verifierOutputSchema = z.object({
  approved: z.boolean(),
  confidence: z.number().min(0).max(1),
  reasoning: z.string().min(1),
  issues: z.array(z.string()),
});

// ---- Public types ----

export interface GenerateDraftRequest {
  exam: ExamSlug;
  subject: SubjectId;
  chapter: ChapterId;
  sourceText: string;
  sourceCitation: string;
  requestedDifficulty: McqDifficulty;
  requestedBy: UserId;
}

// ---- Implementation ----

export async function generateMcqDraft(
  req: GenerateDraftRequest,
  triad: LLMTriad,
  newId: () => string = defaultNewId,
): Promise<McqDraft> {
  const userPrompt = buildGenerationUserPrompt({
    exam: req.exam,
    subject: req.subject,
    chapter: req.chapter,
    sourceText: req.sourceText,
    sourceCitation: req.sourceCitation,
    difficulty: req.requestedDifficulty,
  });

  // Fan out to all 3 primary clients in parallel; capture each result/error
  // independently so a single provider outage doesn't block the others.
  const candidatePromises: Promise<DraftCandidate>[] = triad.primary.map(async (client) => {
    const startedAt = performance.now();
    try {
      const output = await client.generate({
        systemPrompt: MCQ_GEN_SYSTEM_PROMPT,
        userPrompt,
        schema: generationOutputSchema,
        temperature: 0.2,
        maxTokens: 1200,
      });
      return {
        modelId: client.modelId,
        output,
        errorMessage: null,
        durationMs: Math.round(performance.now() - startedAt),
        generatedAt: nowIso(),
      };
    } catch (err) {
      return {
        modelId: client.modelId,
        output: null,
        errorMessage: err instanceof Error ? err.message : String(err),
        durationMs: Math.round(performance.now() - startedAt),
        generatedAt: nowIso(),
      };
    }
  });

  const candidates = await Promise.all(candidatePromises);

  // Pick a "consensus" candidate -- the first non-null one whose answer
  // matches the majority (best 2-of-3, otherwise first non-null).
  const chosenIndex = pickConsensusIndex(candidates);

  // Run the verifier on the chosen candidate (if any). The verifier's
  // verdict is captured but does NOT auto-approve the draft -- admin still
  // reviews + clicks Approve.
  let verifier: VerifierResult | null = null;
  if (chosenIndex !== null) {
    const verifierPrompt = buildVerifierUserPrompt({
      exam: req.exam,
      subject: req.subject,
      chapter: req.chapter,
      sourceText: req.sourceText,
      sourceCitation: req.sourceCitation,
      difficulty: req.requestedDifficulty,
      candidates: candidates.map((c) => ({
        modelId: c.modelId,
        output: c.output
          ? {
              question: c.output.question,
              options: c.output.options,
              correctOption: c.output.correctOption,
              explanation: c.output.explanation,
            }
          : null,
        errorMessage: c.errorMessage,
      })),
      consensusIndex: chosenIndex,
    });
    try {
      const out = await triad.verifier.generate({
        systemPrompt: VERIFIER_SYSTEM_PROMPT,
        userPrompt: verifierPrompt,
        schema: verifierOutputSchema,
        temperature: 0,
        maxTokens: 600,
      });
      verifier = {
        modelId: triad.verifier.modelId,
        approved: out.approved,
        confidence: out.confidence,
        reasoning: out.reasoning,
        issues: out.issues,
        ranAt: nowIso(),
      };
    } catch (err) {
      verifier = {
        modelId: triad.verifier.modelId,
        approved: false,
        confidence: 0,
        reasoning: `verifier failed: ${err instanceof Error ? err.message : String(err)}`,
        issues: ['verifier_call_failed'],
        ranAt: nowIso(),
      };
    }
  }

  return {
    id: newId(),
    prompt: {
      exam: req.exam,
      subject: req.subject,
      chapter: req.chapter,
      sourceText: req.sourceText,
      sourceCitation: req.sourceCitation,
      requestedDifficulty: req.requestedDifficulty,
    },
    candidates,
    verifier,
    chosenCandidateIndex: chosenIndex,
    status: 'pending',
    publishedMcqId: null,
    requestedBy: req.requestedBy,
    requestedAt: nowIso(),
    reviewedBy: null,
    reviewedAt: null,
    reviewNote: null,
  };
}

/**
 * Pick the candidate to verify. Strategy:
 *   1. If at least 2 candidates agree on correctOption, pick the first
 *      such candidate.
 *   2. Else pick the first non-null candidate.
 *   3. If all 3 failed, return null (no consensus possible).
 */
export function pickConsensusIndex(candidates: DraftCandidate[]): number | null {
  const successful = candidates
    .map((c, i) => ({ index: i, output: c.output }))
    .filter((x): x is { index: number; output: NonNullable<DraftCandidate['output']> } =>
      Boolean(x.output),
    );
  if (successful.length === 0) return null;

  // Tally answers
  const counts = new Map<string, number[]>();
  for (const s of successful) {
    const key = s.output.correctOption;
    const arr = counts.get(key) ?? [];
    arr.push(s.index);
    counts.set(key, arr);
  }

  // Find the best (largest) bucket; tie-break by lowest index.
  let bestIndex: number | null = null;
  let bestSize = 0;
  for (const indices of counts.values()) {
    if (indices.length > bestSize) {
      bestSize = indices.length;
      bestIndex = indices[0]!;
    }
  }
  return bestIndex ?? successful[0]!.index;
}

function defaultNewId(): string {
  return globalThis.crypto.randomUUID();
}
