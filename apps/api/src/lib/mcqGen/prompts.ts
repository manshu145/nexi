/**
 * Prompt templates for the 3-AI MCQ generation pipeline.
 *
 * The prompts are deliberately strict and example-rich because we want
 * factual, NCERT-aligned output that students can trust without reading
 * three model variations every time. Every prompt asks the model to:
 *   - cite the source it was given,
 *   - prefer the simplest correct distractors over the cleverest,
 *   - flag in `reasoning` if the source is ambiguous or it had to guess.
 */

import type { McqDifficulty } from '@nexigrate/shared';

export interface McqPromptInput {
  exam: string; // e.g. 'jee-main', 'class-11-cbse'
  subject: string; // e.g. 'physics'
  chapter: string; // e.g. 'units-and-measurements'
  sourceText: string; // chapter excerpt
  sourceCitation: string; // url or "NCERT Class 11 Physics, Ch 1, p. 12"
  difficulty: McqDifficulty;
}

const SYSTEM_PROMPT = `You are an Indian-syllabus exam-prep MCQ author. Your job is to produce
ONE exam-style multiple-choice question that is factually correct, derived
strictly from the source material the user provides, and grammatically
clean. Never invent content beyond the source. If the source is too thin
to support a clean MCQ, return an explanation in the "reasoning" field
saying so and pick the safest possible question.

Hard rules:
- Output MUST be valid JSON conforming to the schema in the user prompt.
- correctOption MUST be one of "A" | "B" | "C" | "D".
- Exactly 4 options, each with a single letter key A..D.
- Distractors must be plausible (a student who half-read the chapter could
  pick them) but UNAMBIGUOUSLY incorrect.
- The explanation must reference the source material so a SME reviewer
  can spot-check it in <30 seconds.
- Do NOT include the option key inside the option text.
- Do NOT use any markdown formatting in question/options text.`;

export function buildGenerationUserPrompt(input: McqPromptInput): string {
  return `Generate ONE multiple-choice question for the following Indian
exam-prep context. Return JSON conforming to this schema:

{
  "question": "string -- the question stem, no markdown",
  "options": [
    { "key": "A", "text": "string" },
    { "key": "B", "text": "string" },
    { "key": "C", "text": "string" },
    { "key": "D", "text": "string" }
  ],
  "correctOption": "A" | "B" | "C" | "D",
  "explanation": "string -- 2-4 sentences citing the source",
  "difficulty": "easy" | "medium" | "hard",
  "reasoning": "string -- your private reasoning for the SME reviewer"
}

Context:
- Exam: ${input.exam}
- Subject: ${input.subject}
- Chapter: ${input.chapter}
- Target difficulty: ${input.difficulty}
- Source citation: ${input.sourceCitation}

Source material (USE THIS, do not go beyond it):
"""
${input.sourceText}
"""`;
}

export interface VerifierPromptInput extends McqPromptInput {
  candidates: {
    modelId: string;
    output: {
      question: string;
      options: { key: 'A' | 'B' | 'C' | 'D'; text: string }[];
      correctOption: 'A' | 'B' | 'C' | 'D';
      explanation: string;
    } | null;
    errorMessage: string | null;
  }[];
  consensusIndex: number; // which candidate to evaluate
}

const VERIFIER_SYSTEM_PROMPT = `You are an SME-grade fact-checker for an
Indian exam-prep platform. You will receive a single MCQ candidate plus
the source text it was supposed to be derived from. Decide:

  1. Is the answer correct?
  2. Are all distractors actually wrong (no second valid answer)?
  3. Is the explanation faithful to the source (no fabrication)?

Output strict JSON:
{
  "approved": true | false,
  "confidence": number between 0 and 1,
  "reasoning": "1-3 sentences",
  "issues": ["short tag for each issue you found"]
}

Be strict. Approving a wrong MCQ that ships to a student is a much worse
failure than rejecting one that could have been published.`;

export function buildVerifierUserPrompt(input: VerifierPromptInput): string {
  const c = input.candidates[input.consensusIndex];
  if (!c || !c.output) {
    return `The selected candidate (${input.consensusIndex}) has no output to verify.
Set approved=false, confidence=0, and explain.`;
  }
  return `Verify this MCQ candidate against the source.

Exam: ${input.exam}  Subject: ${input.subject}  Chapter: ${input.chapter}
Source citation: ${input.sourceCitation}

Source material:
"""
${input.sourceText}
"""

Candidate (from ${c.modelId}):
Question: ${c.output.question}
Options:
${c.output.options.map((o) => `  ${o.key}. ${o.text}`).join('\n')}
Correct: ${c.output.correctOption}
Explanation: ${c.output.explanation}

Other candidates' answers (for context):
${input.candidates
  .map((cc, i) =>
    i === input.consensusIndex
      ? null
      : `  - ${cc.modelId}: ${cc.output ? cc.output.correctOption : 'FAILED'}`,
  )
  .filter(Boolean)
  .join('\n')}

Now produce the JSON verdict.`;
}

export { SYSTEM_PROMPT as MCQ_GEN_SYSTEM_PROMPT, VERIFIER_SYSTEM_PROMPT };
