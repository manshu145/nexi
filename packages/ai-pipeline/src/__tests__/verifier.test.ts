import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { buildChapterVerifier } from '../verifier.js';

/**
 * Verifier unit tests. We mock global fetch so the suite is hermetic --
 * no real Gemini / OpenAI calls. The goal is to lock in:
 *
 *   1. Schema parsing handles markdown fences, junk JSON, and missing fields.
 *   2. The confidence threshold gates `verified` correctly.
 *   3. The Gemini -> OpenAI fallback chain fires in the right order.
 *   4. Pathological inputs short-circuit before a network call.
 */

const realFetch = globalThis.fetch;

interface FetchMockResponse {
  url: string | RegExp;
  body: unknown;
  status?: number;
}

function mockFetchSequence(responses: FetchMockResponse[]) {
  let i = 0;
  globalThis.fetch = vi.fn(async (url: string | URL | Request) => {
    const urlStr = typeof url === 'string' ? url : url instanceof URL ? url.toString() : url.url;
    const r = responses[i];
    if (!r) throw new Error(`fetch mock exhausted at call ${i + 1} (${urlStr})`);
    const matches =
      typeof r.url === 'string' ? urlStr.includes(r.url) : r.url.test(urlStr);
    if (!matches) throw new Error(`fetch mock url mismatch: expected ${r.url}, got ${urlStr}`);
    i++;
    const status = r.status ?? 200;
    return new Response(typeof r.body === 'string' ? r.body : JSON.stringify(r.body), { status });
  }) as typeof fetch;
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

const sampleContent = 'A'.repeat(500);
const sampleContext = {
  exam: 'upsc-cse',
  subject: 'polity',
  chapter: 'Fundamental Rights',
  language: 'en' as const,
};

function geminiResponse(text: string) {
  return { candidates: [{ content: { parts: [{ text }] } }] };
}

describe('buildChapterVerifier', () => {
  it('rejects content shorter than 100 chars without an API call', async () => {
    const fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    const verify = buildChapterVerifier({ geminiApiKey: 'k' });

    const v = await verify('too short', sampleContext);

    expect(v.verified).toBe(false);
    expect(v.confidence).toBe(0);
    expect(v.verifier).toBe('fallback');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('returns verified=true when Gemini scores above threshold', async () => {
    mockFetchSequence([
      {
        url: 'generativelanguage',
        body: geminiResponse('{"confidence": 0.97, "issues": []}'),
      },
    ]);
    const verify = buildChapterVerifier({ geminiApiKey: 'k' });

    const v = await verify(sampleContent, sampleContext);

    expect(v.verified).toBe(true);
    expect(v.confidence).toBe(0.97);
    expect(v.verifier).toBe('gemini-flash');
    expect(v.issues).toHaveLength(0);
  });

  it('returns verified=false when confidence is below the default threshold', async () => {
    mockFetchSequence([
      {
        url: 'generativelanguage',
        body: geminiResponse('{"confidence": 0.7, "issues": [{"kind":"factual_error","message":"wrong year"}]}'),
      },
    ]);
    const verify = buildChapterVerifier({ geminiApiKey: 'k' });

    const v = await verify(sampleContent, sampleContext);

    expect(v.verified).toBe(false);
    expect(v.confidence).toBe(0.7);
    expect(v.issues).toHaveLength(1);
    expect(v.issues[0]?.kind).toBe('factual_error');
  });

  it('strips ```json fences before parsing the verdict', async () => {
    mockFetchSequence([
      {
        url: 'generativelanguage',
        body: geminiResponse('```json\n{"confidence": 0.92, "issues": []}\n```'),
      },
    ]);
    const verify = buildChapterVerifier({ geminiApiKey: 'k' });

    const v = await verify(sampleContent, sampleContext);

    expect(v.confidence).toBe(0.92);
    expect(v.issues).toHaveLength(0);
  });

  it('falls back to OpenAI when Gemini errors', async () => {
    mockFetchSequence([
      { url: 'generativelanguage', body: 'oops', status: 503 },
      {
        url: 'openai',
        body: { choices: [{ message: { content: '{"confidence": 0.93, "issues": []}' } }] },
      },
    ]);
    const verify = buildChapterVerifier({ geminiApiKey: 'k', openaiApiKey: 'o' });

    const v = await verify(sampleContent, sampleContext);

    expect(v.verifier).toBe('gpt-4o-mini');
    expect(v.confidence).toBe(0.93);
  });

  it('returns the "fallback" verdict when all verifiers fail', async () => {
    mockFetchSequence([
      { url: 'generativelanguage', body: 'oops', status: 503 },
      { url: 'openai', body: 'oops', status: 503 },
    ]);
    const verify = buildChapterVerifier({ geminiApiKey: 'k', openaiApiKey: 'o' });

    const v = await verify(sampleContent, sampleContext);

    // Critical: fallback resolves verified=true with confidence=0.5 so a
    // verifier outage does NOT block paying students from getting their
    // chapter. The caller logs the fallback and ships the content.
    expect(v.verifier).toBe('fallback');
    expect(v.verified).toBe(true);
    expect(v.confidence).toBe(0.5);
    expect(v.issues[0]?.message).toContain('Verifier unavailable');
  });

  it('drops malformed issues but keeps valid ones', async () => {
    mockFetchSequence([
      {
        url: 'generativelanguage',
        body: geminiResponse(JSON.stringify({
          confidence: 0.8,
          issues: [
            { kind: 'factual_error', message: 'real issue' },
            { kind: 'unknown_kind', message: 'bucketed as other', excerpt: 'quote' },
            { /* no message */ kind: 'safety' },
            'not an object at all',
          ],
        })),
      },
    ]);
    const verify = buildChapterVerifier({ geminiApiKey: 'k' });

    const v = await verify(sampleContent, sampleContext);

    expect(v.issues).toHaveLength(2);
    expect(v.issues[0]?.kind).toBe('factual_error');
    expect(v.issues[1]?.kind).toBe('other');
    expect(v.issues[1]?.excerpt).toBe('quote');
  });

  it('honours a custom confidence threshold', async () => {
    mockFetchSequence([
      {
        url: 'generativelanguage',
        body: geminiResponse('{"confidence": 0.8, "issues": []}'),
      },
    ]);
    const verify = buildChapterVerifier({ geminiApiKey: 'k', confidenceThreshold: 0.7 });

    const v = await verify(sampleContent, sampleContext);

    // With the lower threshold this passes; with the default 0.85 it would not.
    expect(v.verified).toBe(true);
    expect(v.confidence).toBe(0.8);
  });
});
