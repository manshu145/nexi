import {
  CURRENT_AFFAIRS_CATEGORIES,
} from '@nexigrate/shared';

/**
 * Prompts for the 3-AI Current Affairs daily digest pipeline.
 *
 * The generator takes admin-pasted raw notes (PIB headlines, Ministry
 * press releases, RBI bulletins, etc. from the day) and emits a
 * structured CurrentAffairsDigest with 5-15 items.
 *
 * Editorial stance:
 *   - Source-cited from official Government of India publications or
 *     reputable Indian mainstream press that links primary sources.
 *   - Neutral political voice. Partisan framing is a verifier-flagged
 *     issue.
 *   - Exam-relevant. Tags every item with the exams that could plausibly
 *     ask about it.
 */

export interface CurrentAffairsGenerationContext {
  /** YYYY-MM-DD in IST. The digest covers this calendar day. */
  date: string;
  /** Raw notes pasted by the admin. Headlines, press releases, etc. */
  rawNotes: string;
  /**
   * Optional admin-supplied focus hint, e.g. 'emphasise economy items
   * for Banking aspirants today'. Keeps the generator on-target.
   */
  focusHint?: string;
}

const CATEGORIES_LIST = CURRENT_AFFAIRS_CATEGORIES.join(', ');

const FORMAT_RULES = `Output STRICT JSON with this exact shape:
{
  "summary": "1 sentence tagline of the day's defining story.",
  "items": [
    {
      "id":            "stable-kebab-case-id",
      "headline":      "10-14 word newspaper-style headline",
      "body":          "2-4 sentence factual summary in markdown. **bold** key terms. NO HTML. NO opinion.",
      "category":      "national | international | economy | science-tech | environment | sports | awards | agreements | reports | other",
      "sources":       ["PIB Release dated DD MMM YYYY", "RBI Bulletin Q2 FY24", ...],
      "relevantExams": ["upsc", "ssc", "neet-ug"],
      "tags":          ["3-6 keywords lowercased"]
    }
  ]
}

Hard rules:
- Produce 5 to 15 items. Each item is INDEPENDENT -- a student can read
  any one without the others.
- 'category' MUST be one of: ${CATEGORIES_LIST}.
- 'relevantExams' values MUST come from this set: jee-main, jee-advanced,
  neet-ug, class-11-cbse, class-12-cbse, upsc, ssc. Empty array is allowed
  if the item is general knowledge with no specific exam fit.
- 'sources' should cite the primary publication. If the admin supplied a
  URL, copy it verbatim. NEVER cite blogs, YouTube, or unsourced social
  media as a primary source.
- Body voice is encyclopedic neutral third-person. NO 'we', 'our', no
  emotive adjectives, no political framing. State what happened and what
  the consequence is, with the year-cited authority for any number.
- Headlines are factual, not click-bait.
- Do NOT invent facts. If the admin's notes don't support a claim,
  drop the item rather than guess.
- NO commentary outside the JSON. NO markdown fences.`;

export function currentAffairsGenerationSystem(): string {
  return [
    'You are an Indian-curriculum current-affairs editor producing the daily digest for school + competitive-exam aspirants. Your output is closer to PIB factsheets or The Hindu front page than to a partisan op-ed column.',
    'You optimise for: (a) factual correctness verifiable against PIB, RBI, Ministry releases, or reputable mainstream press, (b) brevity -- a 60-second scan should cover the day, (c) neutral political tone -- no partisan framing, no emotive adjectives, no opinion.',
    'You never invent facts. If the source notes do not support an item, you drop it.',
    FORMAT_RULES,
  ].join('\n\n');
}

export function currentAffairsGenerationUser(
  ctx: CurrentAffairsGenerationContext,
): string {
  return [
    `Generate ONE current-affairs digest for ${ctx.date} (IST).`,
    ``,
    ctx.focusHint ? `Focus hint: ${ctx.focusHint}` : '',
    ``,
    `--- ADMIN'S RAW NOTES ---`,
    ctx.rawNotes.trim(),
    `--- END NOTES ---`,
    ``,
    `Convert into a structured digest. Keep what is verifiable in the notes, drop what is not. Return only the JSON object described in the system prompt.`,
  ]
    .filter(Boolean)
    .join('\n');
}

const VERIFY_RULES = `Output STRICT JSON with this exact shape:
{
  "agreesAccurate":   true | false,
  "factualAccuracy":  0..1,
  "neutrality":       0..1,
  "clarity":          0..1,
  "reasoning":        "2-4 sentences explaining your overall judgement.",
  "factualErrors":    ["specific issue 1", "specific issue 2"]
}

Score rubric:
  factualAccuracy
    0.9-1.0: every claim is verifiable in PIB / RBI / official ministry
             press / reputable mainstream press citing primary sources.
    0.6-0.89: minor wording issues but no material errors.
    0.3-0.59: at least one item is wrong or unsourceable.
    0.0-0.29: multiple factual errors. agreesAccurate MUST be false.
  neutrality
    0.9-1.0: zero partisan framing, no opinion, no loaded adjectives.
    0.6-0.89: occasional editorial-leaning word, otherwise factual.
    0.3-0.59: noticeable partisan framing or opinion.
    0.0-0.29: reads as commentary, not news.
  clarity
    0.9-1.0: each item is crisp 2-4 sentences, no padding, headlines are
             factual not click-bait.
    0.6-0.89: mostly clear, occasional bloat.
    0.3-0.59: padded or unclear summaries.
    0.0-0.29: unreadable.

Hard rules:
- agreesAccurate=true ONLY if factualAccuracy >= 0.7 AND no entries in
  factualErrors AND neutrality >= 0.7.
- factualErrors lists each specific issue (which item, what's wrong),
  or empty array if none.
- Do NOT echo the digest back. Do NOT wrap response in markdown fences.`;

export function currentAffairsVerificationSystem(): string {
  return [
    'You are a senior news desk editor reviewing AI-generated daily current-affairs digests for an Indian-exam-prep knowledge base that brands itself as "verified, neutral, sourced".',
    'Your job is to catch factual errors, partisan framing, and bloat BEFORE any student reads the digest.',
    'You are conservative: when in doubt about a fact, you score lower and explain. You list specific factualErrors so the next regeneration can fix them.',
    VERIFY_RULES,
  ].join('\n\n');
}

export function currentAffairsVerificationUser(draft: {
  date: string;
  summary: string;
  items: { headline: string; body: string; category: string; sources: string[] }[];
}): string {
  const items = draft.items
    .map(
      (it, i) =>
        `### Item ${i + 1} [${it.category}]\nHeadline: ${it.headline}\nBody: ${it.body}\nSources: ${it.sources.join(' | ')}`,
    )
    .join('\n\n');
  return [
    `Review this current-affairs digest.`,
    ``,
    `Date: ${draft.date}`,
    `Tagline: ${draft.summary}`,
    ``,
    `--- ITEMS ---`,
    items,
    `--- END ITEMS ---`,
    ``,
    `Return only the JSON object described in the system prompt.`,
  ].join('\n');
}
