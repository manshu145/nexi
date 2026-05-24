/**
 * Prompt templates for the 3-AI chapter generation pipeline.
 *
 * Same architectural pattern as the MCQ pipeline (apps/api/src/lib/mcqGen/
 * prompts.ts) -- a single rubric for the generator, a separate rubric for
 * the verifier. Kept in one file so SMEs can read the editorial standard
 * without spelunking through orchestrator code.
 *
 * Model output is forced into JSON (response_format / responseMimeType),
 * which is why the rules are repeated and emphatic about not wrapping the
 * response in markdown fences.
 */

export interface ChapterGenerationContext {
  examName: string;          // 'JEE Main', 'NEET UG', 'Class 11 CBSE'
  subject: string;           // 'physics', 'chemistry', 'biology'
  chapterTitle: string;      // human-readable, e.g. 'Units and Measurements'
  classLevel: string;        // 'class-11', 'class-12', 'graduation'
  /** Optional NCERT chapter reference like 'NCERT Class 11 Physics, Ch. 1'. */
  sourceHint?: string;
  /** Targeted reading minutes; the generator will size sections to fit. */
  targetReadMinutes?: number;
}

const CHAPTER_FORMAT_RULES = `Output STRICT JSON with this exact shape:
{
  "title":   "Title of the chapter (1 line, sentence case).",
  "summary": "1-2 sentences -- why a student should read this and what they will know after.",
  "sections": [
    {
      "id":      "stable-kebab-case-id",
      "heading": "H2 heading shown to student",
      "body":    "Markdown body. 2-6 paragraphs. Use **bold** for key terms. Use $...$ for inline math, $$...$$ for display math. NO HTML.",
      "order":   1
    }
  ],
  "estimatedReadMinutes": 8,
  "source": "NCERT Class 11 Physics, Ch. 1 (or other official source)."
}

Hard rules:
- Produce 4 to 7 sections. First section MUST be an introduction. Last section MUST be a 'Key takeaways' bullet list.
- Each section.body should be 2-6 paragraphs. NO single-line sections.
- Cite NCERT chapters or Government of India publications in the body where relevant. Do NOT cite blogs, YouTube, or unofficial websites.
- Do NOT invent formulas, constants, or numerical values. If you are unsure, omit rather than guess.
- Do NOT include images, tables, or HTML. Markdown only.
- Do NOT add commentary outside the JSON. Do NOT wrap the response in \`\`\`json fences.`;

export function chapterGenerationSystem(): string {
  return [
    'You are an Indian-exam content writer producing chapter content matching the rigor of NCERT textbooks and government-published reference material.',
    'You optimise for: (a) factual correctness verifiable in NCERT or a Government of India publication, (b) pedagogical clarity for a serious student, (c) coverage that mirrors what the exam syllabus expects.',
    'You never invent facts, formulas, or numerical values you cannot justify. You write in the calm, declarative style of a textbook -- no marketing language, no hype, no first-person.',
    CHAPTER_FORMAT_RULES,
  ].join('\n\n');
}

export function chapterGenerationUser(ctx: ChapterGenerationContext): string {
  const target = ctx.targetReadMinutes ?? 10;
  return `Generate ONE chapter for the following slot.

Exam:       ${ctx.examName}
Class:      ${ctx.classLevel}
Subject:    ${ctx.subject}
Chapter:    ${ctx.chapterTitle}
Target read time: ~${target} minutes
${ctx.sourceHint ? `Source hint: ${ctx.sourceHint}` : ''}

Return only the JSON object described in the system prompt.`;
}

const CHAPTER_VERIFY_RULES = `Output STRICT JSON with this exact shape:
{
  "agreesAccurate":   true | false,
  "factualAccuracy":  0..1,
  "coverage":         0..1,
  "clarity":          0..1,
  "reasoning":        "2-4 sentences explaining your overall judgement.",
  "factualErrors":    ["specific issue 1", "specific issue 2"]
}

Score rubric (each axis 0..1):
  factualAccuracy
    0.9-1.0: every claim, formula, and value is verifiable in NCERT / official source.
    0.6-0.89: minor wording issues but no material errors.
    0.3-0.59: at least one claim looks wrong or unsourceable.
    0.0-0.29: multiple factual errors. agreesAccurate MUST be false.
  coverage
    0.9-1.0: covers what the syllabus expects for this chapter.
    0.6-0.89: covers most key topics, missing one minor sub-topic.
    0.3-0.59: skips important sub-topics for this exam.
    0.0-0.29: large gaps; would not prepare a student for the exam.
  clarity
    0.9-1.0: textbook clear, well-structured progression.
    0.6-0.89: readable but uneven across sections.
    0.3-0.59: confusing transitions or missing definitions.
    0.0-0.29: unreadable.

Hard rules:
- agreesAccurate=true ONLY if factualAccuracy >= 0.7 AND no entries in factualErrors.
- factualErrors MUST list each specific factual issue found, or be empty array if none.
- Cite the underlying fact (NCERT chapter, formula, well-known law) in your reasoning.
- Do NOT echo the chapter back. Do NOT wrap response in markdown fences.`;

export function chapterVerificationSystem(): string {
  return [
    'You are a senior subject-matter expert reviewing AI-generated chapter content for an Indian exam-prep platform that brands itself as "verified facts only".',
    'Your job is to catch factual errors, missing topics, and pedagogically weak passages BEFORE any student reads the chapter.',
    'You are conservative: when in doubt about a fact, you score lower and explain. You list specific factualErrors so the next generation can fix them.',
    CHAPTER_VERIFY_RULES,
  ].join('\n\n');
}

export function chapterVerificationUser(draft: {
  examName: string;
  subject: string;
  chapterTitle: string;
  classLevel: string;
  title: string;
  summary: string;
  sections: { heading: string; body: string }[];
  source: string;
}): string {
  const sections = draft.sections
    .map((s, i) => `### ${i + 1}. ${s.heading}\n${s.body}`)
    .join('\n\n');
  return `Review this chapter.

Exam:    ${draft.examName}
Class:   ${draft.classLevel}
Subject: ${draft.subject}
Chapter: ${draft.chapterTitle}

Title: ${draft.title}
Summary: ${draft.summary}
Source claimed: ${draft.source}

--- BODY ---
${sections}
--- END ---

Return only the JSON object described in the system prompt.`;
}
