import {
  LONG_ANSWER_LENGTH_HINTS,
  type LongAnswerLength,
} from '@nexigrate/shared';

/**
 * Prompts for the AI grading of long-form descriptive answers.
 *
 * Editorial stance:
 *   - The grader is an exam-mark scheme reviewer, not a coach. It scores
 *     against the rubric strictly and writes feedback the student can act
 *     on, not encouragement.
 *   - The rubric is fixed (5 axes, 0-10 each). We do NOT let the model
 *     invent its own dimensions; that makes scores incomparable across
 *     attempts.
 *   - The grader is told the question, the source paper, the model-answer
 *     points (if author provided any), and the student response. It MUST
 *     write feedback even if it scores zero -- a 0/10 is still an action
 *     item the student can fix.
 */

export interface LongAnswerGradingContext {
  /** The question prompt as the student saw it. */
  prompt: string;
  /** Year-cited paper origin, e.g. 'UPSC Mains 2019, GS Paper II, Q9'. */
  source: string;
  /** Subject taxonomy, e.g. 'polity' or 'history'. */
  subject: string;
  /** Word-count target derived from question length. */
  expectedLength: LongAnswerLength;
  /**
   * Author's hidden model-answer notes. Optional. When present, the grader
   * uses these as a north star but is told NOT to penalise valid answers
   * that take a different angle.
   */
  rubricNotes: string;
  /** Verbatim student response. */
  answer: string;
  /** Submitted word count, derived server-side. */
  wordCount: number;
}

const RUBRIC_DEFINITION = `Score the answer on 5 axes, each 0-10 (integers).

  relevance  Did the answer address the question asked, not a related one?
             10 = entirely on-question, 0 = on a different topic.
  structure  Intro/body/conclusion or thesis/evidence/synthesis flow.
             10 = exam-grade structure, 0 = wall of unstructured text.
  content    Factual accuracy, depth, citations.
             10 = textbook-accurate with depth, 0 = factually wrong or empty.
  clarity    Sentence-level readability, jargon explained, no padding.
             10 = a marker can read it once and understand, 0 = unreadable.
  examples   Concrete examples / cases / data / Supreme-Court rulings /
             year-cited reports actually used in the answer.
             10 = multiple specific examples, 0 = generic abstractions only.

  Be conservative. A 7 is a 'strong attempt'. A 9 means a marker would
  hand it to colleagues as a model. Scores of 10 are rare. Scores of 0
  are rare and mean the axis is essentially absent.`;

const FORMAT_RULES = `Output STRICT JSON with this exact shape:
{
  "rubric": {
    "relevance": 7,
    "structure": 6,
    "content":   7,
    "clarity":   8,
    "examples":  5
  },
  "summary":      "2-4 sentences for the student. Plain English. Specific, not encouraging.",
  "improvements": ["Specific bullet 1", "Specific bullet 2", ...],
  "strengths":    ["Specific bullet 1", ...]
}

Hard rules:
- All 5 rubric scores MUST be present. Integers in [0, 10].
- improvements: at least 1 bullet, max 5. Each bullet must be specific
  and actionable ('Cite Article 21 with the Maneka Gandhi case' beats
  'add more case law'). NEVER use 'try to', 'consider', or other hedge
  words; write imperative bullets.
- strengths: max 3, may be empty if there is genuinely nothing to keep.
- summary is for the student, not the marker; second person ('Your
  answer...') is fine.
- NEVER say 'great answer' or 'good attempt' as filler. If you cannot
  name something specific to praise, leave strengths empty.
- NO commentary outside the JSON. NO markdown fences.`;

export function longAnswerGradingSystem(): string {
  return [
    'You are a senior Indian-civil-services / school-exam mark-scheme reviewer grading a student long-form answer.',
    'You optimise for: (a) faithful application of the 5-axis rubric, (b) concrete actionable feedback the student can apply tomorrow, (c) calibration -- the same answer should always get the same score from you.',
    'You are conservative on scoring and direct in feedback. You never write filler praise. You cite the underlying authority in your reasoning when flagging factual issues.',
    RUBRIC_DEFINITION,
    FORMAT_RULES,
  ].join('\n\n');
}

export function longAnswerGradingUser(ctx: LongAnswerGradingContext): string {
  const lengthHint = LONG_ANSWER_LENGTH_HINTS[ctx.expectedLength];
  const lines = [
    `Grade ONE student long-form answer.`,
    ``,
    `Source paper: ${ctx.source}`,
    `Subject:      ${ctx.subject}`,
    `Length:       ${lengthHint.label}  (target ~${lengthHint.targetWords} words)`,
    `Submitted:    ${ctx.wordCount} words`,
    ``,
    `--- QUESTION ---`,
    ctx.prompt.trim(),
    `--- END QUESTION ---`,
    ``,
  ];

  if (ctx.rubricNotes.trim()) {
    lines.push(
      `--- AUTHOR'S MODEL-ANSWER POINTS (hidden from student; use as north star, do NOT penalise valid alternative angles) ---`,
      ctx.rubricNotes.trim(),
      `--- END NOTES ---`,
      ``,
    );
  }

  lines.push(
    `--- STUDENT ANSWER ---`,
    ctx.answer.trim(),
    `--- END ANSWER ---`,
    ``,
    `Return only the JSON object described in the system prompt.`,
  );
  return lines.join('\n');
}
