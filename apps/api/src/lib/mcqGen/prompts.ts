/**
 * Prompt templates for the 3-AI MCQ pipeline.
 *
 * Kept in one file so SMEs can read the rubric without spelunking through
 * orchestrator code. The same prompts are used in dev and prod; the only
 * runtime variable is the (exam, subject, chapter) substitution.
 */

export interface GenerationContext {
  examName: string;          // e.g. 'JEE Main', 'NEET UG'
  subject: string;           // e.g. 'Physics', 'Chemistry'
  chapter: string;           // e.g. 'Kinematics', 'Thermodynamics'
  classLevel: string;        // e.g. 'Class 11', 'Class 12'
  difficulty: 'easy' | 'medium' | 'hard';
  /** Optional NCERT chapter reference like 'NCERT Class 11 Physics, Ch. 3'. */
  sourceHint?: string;
}

const FORMAT_RULES = `Output STRICT JSON with this exact shape:
{
  "question": "Plain text question, 1-3 lines.",
  "options": [
    { "key": "A", "text": "..." },
    { "key": "B", "text": "..." },
    { "key": "C", "text": "..." },
    { "key": "D", "text": "..." }
  ],
  "correctOption": "A" | "B" | "C" | "D",
  "explanation": "1-3 sentences. State why the correct option is correct AND briefly why the most tempting wrong option is wrong.",
  "source": "Source citation string, e.g. 'NCERT Class 11 Physics, Ch. 3'."
}

Hard rules:
- The 4 options must all be plausible to a serious student of the topic.
- Exactly one must be correct.
- Do NOT include 'all of the above' or 'none of the above'.
- Do NOT add commentary outside the JSON. Do NOT wrap in markdown.`;

export function generationSystem(): string {
  return [
    'You are an Indian-exam content writer producing single-correct MCQs that match the rigor of NCERT textbooks and recent JEE/NEET papers.',
    'You optimise for: (a) factual correctness verifiable in NCERT or a Government of India publication, (b) pedagogical clarity, (c) reasonable difficulty calibration.',
    'You never invent facts, formulas, or numerical values you cannot justify.',
    FORMAT_RULES,
  ].join('\n\n');
}

export function generationUser(ctx: GenerationContext): string {
  return `Generate ONE MCQ for the following slot.

Exam:       ${ctx.examName}
Class:      ${ctx.classLevel}
Subject:    ${ctx.subject}
Chapter:    ${ctx.chapter}
Difficulty: ${ctx.difficulty}
${ctx.sourceHint ? `Source hint: ${ctx.sourceHint}` : ''}

Return only the JSON object described in the system prompt.`;
}

const VERIFY_RULES = `Output STRICT JSON with this exact shape:
{
  "agreesCorrect": true | false,
  "score": 0..1,
  "reasoning": "1-3 sentences explaining your judgement.",
  "suggestedFix": null | { "correctOption": "A"|"B"|"C"|"D", "why": "..." }
}

Score rubric:
  0.9 - 1.0: question is well-formed AND the marked correctOption is unambiguously right.
  0.6 - 0.89: marked correctOption is right but distractors are weak / explanation is off.
  0.3 - 0.59: ambiguous question OR multiple options could be defended as correct.
  0.0 - 0.29: marked correctOption is wrong; suggestedFix MUST be populated.

Hard rules:
- Read every option, not just the marked one.
- Cite the underlying fact (formula, NCERT chapter, well-known law) in your reasoning.
- Do NOT echo the question back. Do NOT wrap in markdown.`;

export function verificationSystem(): string {
  return [
    'You are a senior subject-matter expert reviewing AI-generated MCQs for an Indian exam-prep platform.',
    'Your job is to catch factual errors, ambiguous wording, and weak distractors before any student sees the question.',
    'You are conservative: when in doubt about a fact, you score lower and explain.',
    VERIFY_RULES,
  ].join('\n\n');
}

export function verificationUser(draft: {
  question: string;
  options: { key: 'A' | 'B' | 'C' | 'D'; text: string }[];
  correctOption: 'A' | 'B' | 'C' | 'D';
  explanation: string;
}): string {
  const opts = draft.options.map((o) => `  ${o.key}. ${o.text}`).join('\n');
  return `Review this MCQ.

Question:
${draft.question}

Options:
${opts}

Marked correct option: ${draft.correctOption}

Explanation provided:
${draft.explanation}

Return only the JSON object described in the system prompt.`;
}
