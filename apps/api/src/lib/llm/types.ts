import type { z } from 'zod';

/**
 * LLM client interface.
 *
 * Every provider (OpenAI, Gemini, Groq, ...) implements this same shape so
 * the orchestrator above can fan a single prompt across all three and
 * compare answers.
 *
 * Why a custom interface instead of the official SDKs:
 *   - The Vercel AI SDK / OpenAI SDK / Google GenAI SDK / Groq SDK each
 *     ship 5-30 MB of code; chaining all three balloons the Cloud Run
 *     container by ~150 MB and slows cold starts noticeably.
 *   - Each provider's chat-completion HTTP API is small and stable
 *     enough that direct `fetch` is fine for our needs.
 *   - This interface is trivial to mock for tests.
 */

export interface LLMClient {
  /** Unique provider+model identifier, used for audit + provenance. */
  readonly modelId: string;

  /**
   * Send a structured-output prompt and return parsed-and-validated JSON.
   * Throws LLMError on transport, schema, or content failures.
   */
  generate<T>(opts: GenerateOptions<T>): Promise<T>;
}

export interface GenerateOptions<T> {
  systemPrompt: string;
  userPrompt: string;
  /** Response is required to JSON-parse and pass this schema. */
  schema: z.ZodSchema<T>;
  /** Sampling temperature (0..2). Defaults to 0.2 for fact tasks. */
  temperature?: number;
  /** Hard cap on output length. Defaults to 1000. */
  maxTokens?: number;
  /** Request timeout in ms. Defaults to 30_000. */
  timeoutMs?: number;
}

export class LLMError extends Error {
  constructor(
    message: string,
    public override readonly cause?: unknown,
    public readonly provider?: string,
  ) {
    super(message);
    this.name = 'LLMError';
  }
}

/** Tiny helper: fetch with timeout via AbortController. */
export async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/** Strip a markdown fence around JSON if a model insists on returning ```json ... ```. */
export function stripJsonFence(s: string): string {
  const trimmed = s.trim();
  if (trimmed.startsWith('```')) {
    return trimmed.replace(/^```(?:json)?\s*/i, '').replace(/```$/, '').trim();
  }
  return trimmed;
}
