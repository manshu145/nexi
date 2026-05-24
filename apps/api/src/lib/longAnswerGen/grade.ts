import {
  asISODateTime,
  type ISODateTime,
  type LongAnswerGrade,
  type LongAnswerRubric,
} from '@nexigrate/shared';
import type { LLMClient } from '../llm/index.js';
import { safeParseLlmJson } from '../llm/parseJson.js';
import {
  longAnswerGradingSystem,
  longAnswerGradingUser,
  type LongAnswerGradingContext,
} from './prompts.js';

/**
 * Single-grader long-answer pipeline.
 *
 * One model. One call. Deterministic temperature. We deliberately do NOT
 * panel-grade because:
 *   1. The student needs ONE score, and a panel produces three.
 *   2. Grading is the deliverable; we want stability over redundancy.
 *   3. The 3-AI pattern is designed for content authoring (where
 *      disagreement = uncertainty = useful signal). For scoring, model
 *      disagreement is just noise.
 *
 * If a single grade ever becomes too noisy, we'd run the same prompt twice
 * with the same model and average -- not bring in a second model.
 */

export interface GradeLongAnswerInput {
  context: LongAnswerGradingContext;
  grader: LLMClient;
  now?: () => ISODateTime;
}

interface RawGradeJson {
  rubric: {
    relevance: number;
    structure: number;
    content: number;
    clarity: number;
    examples: number;
  };
  summary: string;
  improvements: string[];
  strengths?: string[];
}

function isValidGrade(d: unknown): d is RawGradeJson {
  if (typeof d !== 'object' || d === null) return false;
  const o = d as Record<string, unknown>;
  const r = o['rubric'];
  if (typeof r !== 'object' || r === null) return false;
  const ro = r as Record<string, unknown>;
  for (const k of ['relevance', 'structure', 'content', 'clarity', 'examples']) {
    const v = ro[k];
    if (typeof v !== 'number' || v < 0 || v > 10) return false;
  }
  if (typeof o['summary'] !== 'string' || o['summary'].trim().length < 5) return false;
  const imp = o['improvements'];
  if (!Array.isArray(imp) || imp.length === 0 || imp.length > 5) return false;
  for (const b of imp) {
    if (typeof b !== 'string' || b.trim().length < 5) return false;
  }
  return true;
}

function clampInt(n: number): number {
  return Math.max(0, Math.min(10, Math.round(n)));
}

export async function gradeLongAnswer(
  input: GradeLongAnswerInput,
): Promise<LongAnswerGrade> {
  const now = input.now ?? (() => asISODateTime(new Date().toISOString()));

  const resp = await input.grader.complete({
    promptName: 'long_answer.grade',
    system: longAnswerGradingSystem(),
    user: longAnswerGradingUser(input.context),
    json: true,
    // Low but not zero -- we want consistency but allow the model to
    // weight the rubric axes differently across genuinely different
    // answers.
    temperature: 0.2,
    // Rubric + summary + up to 5 improvements + up to 3 strengths fits
    // comfortably in 1500.
    maxTokens: 1500,
  });

  const parsed = safeParseLlmJson<RawGradeJson>(resp.content);
  if (!parsed || !isValidGrade(parsed)) {
    throw new Error(
      `[long-answer] grader (${input.grader.providerId}) returned malformed JSON: ${resp.content.slice(0, 200)}`,
    );
  }

  const rubric: LongAnswerRubric = {
    relevance: clampInt(parsed.rubric.relevance),
    structure: clampInt(parsed.rubric.structure),
    content: clampInt(parsed.rubric.content),
    clarity: clampInt(parsed.rubric.clarity),
    examples: clampInt(parsed.rubric.examples),
  };
  const overall = Math.round(
    (rubric.relevance + rubric.structure + rubric.content + rubric.clarity + rubric.examples) /
      5,
  );

  return {
    overall,
    rubric,
    summary: parsed.summary.trim(),
    improvements: parsed.improvements.map((s) => s.trim()).filter(Boolean).slice(0, 5),
    strengths: Array.isArray(parsed.strengths)
      ? parsed.strengths.map((s) => s.trim()).filter(Boolean).slice(0, 3)
      : [],
    graderModelId: input.grader.modelId,
    gradedAt: now(),
  };
}

export function countWords(s: string): number {
  return s.trim().split(/\s+/).filter(Boolean).length;
}
