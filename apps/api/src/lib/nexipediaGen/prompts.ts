/**
 * Prompts for the 3-AI Nexipedia article generation pipeline.
 *
 * Editorial voice differs from chapters:
 *   - Encyclopedia third-person ("Photosynthesis is the process by which
 *     green plants...") rather than textbook-pedagogical ("In this
 *     chapter we will learn about...").
 *   - No exam framing in the body. The article is exam-agnostic; relevant
 *     exams are surfaced in metadata, not interspersed in the prose.
 *   - Heavier emphasis on verifiable sourcing -- a Nexipedia article that
 *     cannot cite an NCERT chapter, government publication, or peer-
 *     reviewed source for a major claim must be rejected.
 */

import type { NexipediaCategory } from '@nexigrate/shared';

export interface NexipediaGenerationContext {
  /** Stable kebab-case slug, e.g. 'photosynthesis' or 'partition-of-india'. */
  slug: string;
  /** Human-readable title fed to the AI prompt. */
  title: string;
  category: NexipediaCategory;
  /** Optional outline / scope hint to constrain the generation. */
  outlineHint?: string;
  /** Optional source citation hint, e.g. 'NCERT Class 12 Biology Ch. 13'. */
  sourceHint?: string;
  /** Targeted reading minutes; the generator will size sections to fit. */
  targetReadMinutes?: number;
}

const FORMAT_RULES = `Output STRICT JSON with this exact shape:
{
  "title":   "Title (1 line, encyclopedia-style sentence case).",
  "summary": "2-3 sentences. What this is and why it matters. Plain prose, no marketing.",
  "sections": [
    {
      "id":      "stable-kebab-case-id",
      "heading": "Section heading shown to the reader",
      "body":    "Markdown body. 2-5 paragraphs. **bold** key terms. $...$ inline math. $$...$$ display math. NO HTML.",
      "order":   1
    }
  ],
  "estimatedReadMinutes": 6,
  "source": "Specific NCERT chapter or Government of India publication. e.g. 'NCERT Class 12 Biology, Ch. 13'. For exam-guide and learning-tip categories: cite the exam authority (NTA, CBSE, UPSC) or a peer-reviewed cognitive-science reference.",
  "relatedExams": ["jee-main", "neet-ug", "class-12-cbse"]
}

Hard rules:
- Produce 4 to 8 sections. First section MUST be an introduction. Last section MUST be a 'See also' or 'Key takeaways' bullet list.
- Default voice is encyclopedia third-person. NO 'in this article', 'we will learn', or other textbook framing.
- For category 'exam-guide': second-person practical advice voice IS expected ("you should", "your strategy"). Exam framing in prose is REQUIRED, not flagged. Cite the exam authority (NTA, CBSE, UPSC) for any factual claim about syllabus, pattern, or marks.
- For category 'learning-tip': pedagogical technique voice. Cite peer-reviewed cognitive-science sources (Brown/Roediger 'Make It Stick', published learning-science research) for any claim about effectiveness. NO unsourced productivity-blog tropes.
- For all OTHER categories: NO exam-prep framing inside section bodies. Exam relevance goes in relatedExams metadata only.
- Cite NCERT chapters or Government of India publications inline where claims need backing. Do NOT cite blogs, YouTube, or unofficial websites.
- Do NOT invent facts, formulas, dates, or numerical values. If unsure, omit rather than guess.
- relatedExams is an array of slugs from this list ONLY: jee-main, jee-advanced, neet-ug, class-11-cbse, class-12-cbse, upsc, ssc. Empty array is fine for general knowledge or learning-tip.
- NO images, tables, or HTML. Markdown only.
- NO commentary outside the JSON. NO markdown fences around the response.`;

export function nexipediaGenerationSystem(): string {
  return [
    'You are an Indian-curriculum reference writer producing encyclopedia-quality articles for school and competitive-exam students. Your output is closer to NCERT supplementary material or the Britannica Concise than to a coaching textbook.',
    'You optimise for: (a) factual correctness verifiable against NCERT or a Government of India publication, (b) clarity for a serious 14-22 year-old student, (c) neutral encyclopedia tone -- no first person, no marketing.',
    'You never invent facts, dates, formulas, or numerical values you cannot cite. You err on the side of saying less.',
    FORMAT_RULES,
  ].join('\n\n');
}

const CATEGORY_HINTS: Record<NexipediaCategory, string> = {
  science:
    'Lead with definition and underlying principles. Include a derivation or mechanism if applicable. End with key applications and exam relevance.',
  mathematics:
    'Lead with definition and notation. Include theorems and proofs at school level. End with worked example references and exam relevance.',
  history:
    'Lead with what + when + where. Cover causes, key figures, course of events, and consequences. Cite NCERT history textbooks where possible.',
  geography:
    'Lead with location and physical/political context. Cover physiography, climate, economy, and significance. Cite NCERT geography textbooks.',
  'civics-polity':
    'Lead with constitutional / legal definition. Cover articles, amendments, landmark cases, and current state. Cite the Constitution of India and government publications.',
  economy:
    'Lead with definition and scope. Cover history, current state in India, key indicators with year. Cite Economic Survey, RBI publications, NCERT economics textbooks.',
  literature:
    'Lead with author + period + form. Cover plot/themes/style at a high level. Cite NCERT or established literary references.',
  biography:
    'Lead with full name + dates + nationality + primary contribution. Cover early life, major work, and legacy. Cite primary sources or NCERT history.',
  'current-affairs':
    'State the event with date and source. Cover background, key facts, and significance. Cite official press releases (PIB) or government publications.',
  'general-knowledge':
    'Lead with a clear definition. Cover origin, current state, and Indian context where relevant.',
  'exam-guide':
    'Practical exam-prep advice. Open with the exam name + authority + current pattern (year-cited). Cover: syllabus scope, marks/section breakdown, recommended NCERT-first study sequence, common pitfalls, and a concrete week-by-week or month-by-month plan. Use second-person ("you should", "your revision"). Every quantitative claim about syllabus, marks, or paper pattern MUST cite the issuing authority (NTA, CBSE, UPSC, NEET-AIIMS) and the year. Do NOT recommend specific coaching brands or YouTube channels.',
  'learning-tip':
    'Pedagogical technique article. Open with the technique name + one-line definition + the cognitive principle it leverages (e.g. retrieval practice, spaced repetition, interleaving, dual coding). Cover: how it works, evidence base (cite peer-reviewed cognitive-science source), step-by-step how to apply it during NCERT-based study, common mistakes, and a 1-week worked example. NO productivity-blog tropes ("just be consistent", "discipline > motivation"). Every effectiveness claim must cite a published source (Brown/Roediger "Make It Stick", Karpicke, Bjork, etc.).',
};

export function nexipediaGenerationUser(ctx: NexipediaGenerationContext): string {
  const target = ctx.targetReadMinutes ?? 6;
  return [
    `Generate ONE Nexipedia article.`,
    ``,
    `Slug:     ${ctx.slug}`,
    `Title:    ${ctx.title}`,
    `Category: ${ctx.category}`,
    `Target read time: ~${target} minutes`,
    ctx.sourceHint ? `Source hint: ${ctx.sourceHint}` : '',
    ctx.outlineHint ? `Outline hint: ${ctx.outlineHint}` : '',
    ``,
    `Category guidance: ${CATEGORY_HINTS[ctx.category]}`,
    ``,
    `Return only the JSON object described in the system prompt.`,
  ]
    .filter(Boolean)
    .join('\n');
}

const VERIFY_RULES = `Output STRICT JSON with this exact shape:
{
  "agreesAccurate":   true | false,
  "factualAccuracy":  0..1,
  "structure":        0..1,
  "clarity":          0..1,
  "reasoning":        "2-4 sentences explaining your overall judgement.",
  "factualErrors":    ["specific issue 1", "specific issue 2"]
}

Score rubric:
  factualAccuracy
    0.9-1.0: every claim, date, formula, or number is verifiable in NCERT or an official source.
    0.6-0.89: minor wording issues but no material errors.
    0.3-0.59: at least one claim looks wrong or unsourceable.
    0.0-0.29: multiple factual errors. agreesAccurate MUST be false.
  structure
    0.9-1.0: clean encyclopedia structure -- definition, body, takeaways.
    0.6-0.89: readable but uneven across sections.
    0.3-0.59: missing intro or takeaways, or wandering organisation.
    0.0-0.29: poorly organised.
  clarity
    0.9-1.0: clear for a serious school/competitive-exam student.
    0.6-0.89: mostly clear, occasional jargon left undefined.
    0.3-0.59: confusing transitions, missing definitions.
    0.0-0.29: unreadable.

Hard rules:
- agreesAccurate=true ONLY if factualAccuracy >= 0.7 AND no entries in factualErrors.
- Cite the underlying authority in your reasoning when flagging an error (NCERT chapter, formula, well-known fact).
- factualErrors lists each specific issue, or empty array if none.
- Do NOT echo the article back. Do NOT wrap response in markdown fences.`;

export function nexipediaVerificationSystem(): string {
  return [
    'You are a senior reference editor reviewing AI-generated articles for an Indian-curriculum knowledge base that brands itself as "verified facts only".',
    'Your job is to catch factual errors, voice-style violations, and structurally weak passages BEFORE any student reads the article.',
    'Voice-style rules are CATEGORY-DEPENDENT (the user prompt will tell you the category):',
    '  - For category "exam-guide": second-person practical advice voice IS expected ("you should"). Do NOT flag exam-prep framing. DO flag any quantitative claim about syllabus, marks, or pattern that is not year-cited to NTA/CBSE/UPSC/NEET-AIIMS.',
    '  - For category "learning-tip": pedagogical-technique voice with peer-reviewed cognitive-science citations IS expected. DO flag unsourced productivity-blog claims and unsupported effectiveness numbers.',
    '  - For ALL OTHER categories: flag exam-prep framing in prose (it belongs in relatedExams metadata only).',
    'You are conservative: when in doubt about a fact, you score lower and explain. You list specific factualErrors so the next regeneration can fix them.',
    VERIFY_RULES,
  ].join('\n\n');
}

export function nexipediaVerificationUser(draft: {
  slug: string;
  title: string;
  summary: string;
  category: NexipediaCategory;
  source: string;
  sections: { heading: string; body: string }[];
}): string {
  const sections = draft.sections
    .map((s, i) => `### ${i + 1}. ${s.heading}\n${s.body}`)
    .join('\n\n');
  return [
    `Review this Nexipedia article.`,
    ``,
    `Slug:     ${draft.slug}`,
    `Title:    ${draft.title}`,
    `Category: ${draft.category}`,
    `Source claimed: ${draft.source}`,
    ``,
    `Summary: ${draft.summary}`,
    ``,
    `--- BODY ---`,
    sections,
    `--- END ---`,
    ``,
    `Return only the JSON object described in the system prompt.`,
  ].join('\n');
}
