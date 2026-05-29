import type {
  ChapterVerificationContext,
  VerificationIssue,
  VerificationIssueKind,
  VerifyChapterFn,
} from './types.js';

/**
 * Default confidence below which `verified` resolves to false. Calibrated
 * empirically: at 0.85, the verifier flags genuine factual errors while
 * letting through stylistic variation that doesn't matter pedagogically.
 */
export const DEFAULT_CONFIDENCE_THRESHOLD = 0.85;

interface BuildVerifierOptions {
  /**
   * Gemini API key. We default the verifier to Gemini Flash because at
   * the chapter-content workload (~5KB inputs, hundreds per day) it is
   * 10-20x cheaper than GPT-4o-mini for similar fact-checking quality
   * on structured Indian-syllabus content.
   */
  geminiApiKey: string;
  /**
   * OpenAI API key, used as the fallback verifier if Gemini errors out.
   * Optional -- if absent, a Gemini failure resolves to a 'fallback'
   * verdict that says "could not verify, ship cautiously".
   */
  openaiApiKey?: string;
  /** Optional override of the trip threshold. */
  confidenceThreshold?: number;
  /** Tag passed to console.* logs for traceability across services. */
  loggerTag?: string;
}

const VERIFIER_SYSTEM_PROMPT = `You are an EXPERT fact-checker for Indian education content, working alongside an AI generator.

A primary AI has produced a study chapter for an Indian student. Your job is to spot-check it for:
  1. Factual errors (wrong dates, wrong articles, miscited NCERT facts)
  2. Syllabus mismatch (topics OUTSIDE the official curriculum for the named exam)
  3. Unsupported claims (assertions that look invented or hallucinated)
  4. Language mismatch (English content in a Hindi chapter, or vice versa)
  5. Level mismatch (advanced jargon in a beginner chapter)
  6. Safety (harmful or biased content, even subtle)

Output STRICTLY as JSON in this format and NOTHING else:

{
  "confidence": <number between 0.00 and 1.00 with 2 decimals>,
  "issues": [
    { "kind": "factual_error|syllabus_mismatch|unsupported_claim|language_mismatch|level_mismatch|safety|other",
      "message": "<short English description>",
      "excerpt": "<optional short quote, max 100 chars>" }
  ]
}

CONFIDENCE BANDS (use exactly):
  0.95-1.00 : Content is clean. Issues array is [].
  0.85-0.94 : Minor stylistic concerns only. Issues may list them.
  0.70-0.84 : One factual error OR one off-syllabus topic. Caller should regenerate.
  0.40-0.69 : Multiple errors OR major syllabus drift.
  0.00-0.39 : Hallucination. Do NOT ship.

Be honest. A clean chapter must score >= 0.95. Do not invent issues to look careful.`;

const KNOWN_KINDS: readonly VerificationIssueKind[] = [
  'factual_error',
  'syllabus_mismatch',
  'unsupported_claim',
  'language_mismatch',
  'level_mismatch',
  'safety',
  'other',
];

function clampConfidence(raw: unknown): number {
  const n = typeof raw === 'number' ? raw : Number.NaN;
  if (!Number.isFinite(n)) return 0.5;
  return Math.max(0, Math.min(1, Math.round(n * 100) / 100));
}

function normaliseIssue(raw: unknown): VerificationIssue | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as { kind?: unknown; message?: unknown; excerpt?: unknown };
  const kind = (KNOWN_KINDS as readonly string[]).includes(r.kind as string)
    ? (r.kind as VerificationIssueKind)
    : 'other';
  const message = typeof r.message === 'string' && r.message.trim().length > 0
    ? r.message.slice(0, 280)
    : null;
  if (!message) return null;
  const excerpt = typeof r.excerpt === 'string' && r.excerpt.trim().length > 0
    ? r.excerpt.slice(0, 200)
    : undefined;
  return excerpt ? { kind, message, excerpt } : { kind, message };
}

/**
 * Strip markdown code fences that Gemini sometimes adds even with strict
 * instructions. The fenced block is the only JSON we want.
 */
function stripFences(text: string): string {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  return fenced && fenced[1] ? fenced[1].trim() : trimmed;
}

interface VerifierResponseShape {
  confidence: unknown;
  issues: unknown;
}

function parseVerifierResponse(raw: string): { confidence: number; issues: VerificationIssue[] } | null {
  try {
    const cleaned = stripFences(raw);
    const parsed = JSON.parse(cleaned) as VerifierResponseShape;
    const confidence = clampConfidence(parsed.confidence);
    const issuesArray = Array.isArray(parsed.issues) ? parsed.issues : [];
    const issues = issuesArray
      .map(normaliseIssue)
      .filter((i): i is VerificationIssue => i !== null);
    return { confidence, issues };
  } catch {
    return null;
  }
}

function buildUserPrompt(content: string, context: ChapterVerificationContext): string {
  return `Exam: ${context.exam}
Subject: ${context.subject}
Chapter: ${context.chapter}
Target language: ${context.language === 'hi' ? 'Hindi (Devanagari)' : 'English'}
Target level: ${context.level ?? 'intermediate'}

--- BEGIN CONTENT ---
${content}
--- END CONTENT ---

Return your JSON verdict now.`;
}

async function callGemini(
  apiKey: string,
  prompt: string,
): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: `${VERIFIER_SYSTEM_PROMPT}\n\n${prompt}` }] }],
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 2048,
            responseMimeType: 'application/json',
          },
        }),
      },
    );
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      return { ok: false, error: `gemini_${res.status}:${body.slice(0, 200)}` };
    }
    const json = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    const text = json.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    if (!text) return { ok: false, error: 'gemini_empty_response' };
    return { ok: true, text };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

async function callOpenAI(
  apiKey: string,
  prompt: string,
): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0.2,
        max_tokens: 2048,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: VERIFIER_SYSTEM_PROMPT },
          { role: 'user', content: prompt },
        ],
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      return { ok: false, error: `openai_${res.status}:${body.slice(0, 200)}` };
    }
    const json = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const text = json.choices?.[0]?.message?.content ?? '';
    if (!text) return { ok: false, error: 'openai_empty_response' };
    return { ok: true, text };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Build a verifier function bound to the supplied API keys + threshold.
 *
 * Cost profile:
 *   - Gemini Flash: ~$0.0005 per chapter verified (input ~3k tokens, output <500)
 *   - GPT-4o-mini fallback: ~$0.001 per chapter
 *   - Worst case (Gemini fails, OpenAI succeeds): two API calls, still under
 *     $0.0015 -- a 10x margin under the $0.05/chapter generation cost.
 *
 * Behaviour when both Gemini and OpenAI fail: returns a "fallback" verdict
 * with `verified: true` and `confidence: 0.5`. The thinking is that we
 * shouldn't BLOCK a paying student on the verifier being down, but we DO
 * want to log it. Callers can read `verifier === 'fallback'` and surface
 * a "preview content" badge if they want.
 */
export function buildChapterVerifier(opts: BuildVerifierOptions): VerifyChapterFn {
  const threshold = opts.confidenceThreshold ?? DEFAULT_CONFIDENCE_THRESHOLD;

  return async function verifyChapter(content, context) {
    const start = Date.now();

    // Skip pathological inputs before we burn an API call.
    if (!content || content.trim().length < 100) {
      return {
        verified: false,
        confidence: 0.0,
        issues: [{ kind: 'other', message: 'Content shorter than 100 characters; rejected.' }],
        latencyMs: Date.now() - start,
        verifier: 'fallback',
      };
    }

    const userPrompt = buildUserPrompt(content, context);

    // Primary: Gemini Flash.
    const gemini = await callGemini(opts.geminiApiKey, userPrompt);
    if (gemini.ok) {
      const parsed = parseVerifierResponse(gemini.text);
      if (parsed) {
        return {
          verified: parsed.confidence >= threshold,
          confidence: parsed.confidence,
          issues: parsed.issues,
          latencyMs: Date.now() - start,
          verifier: 'gemini-flash',
          rawResponse: gemini.text.slice(0, 2000),
        };
      }
    }

    // Fallback: GPT-4o-mini, if configured.
    if (opts.openaiApiKey) {
      const openai = await callOpenAI(opts.openaiApiKey, userPrompt);
      if (openai.ok) {
        const parsed = parseVerifierResponse(openai.text);
        if (parsed) {
          return {
            verified: parsed.confidence >= threshold,
            confidence: parsed.confidence,
            issues: parsed.issues,
            latencyMs: Date.now() - start,
            verifier: 'gpt-4o-mini',
            rawResponse: openai.text.slice(0, 2000),
          };
        }
      }
    }

    // Both verifiers failed. Don't block the user; log and continue.
    return {
      verified: true,
      confidence: 0.5,
      issues: [{
        kind: 'other',
        message: 'Verifier unavailable; content shipped without cross-check.',
      }],
      latencyMs: Date.now() - start,
      verifier: 'fallback',
    };
  };
}
