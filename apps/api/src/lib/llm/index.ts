/**
 * LLM client interface for the MCQ generation + verification pipeline.
 *
 * Three implementations sit behind this single shape:
 *   - OpenAIClient    -> OpenAI Chat Completions (gpt-4o-mini), used as
 *                        the primary GENERATOR.
 *   - GeminiClient    -> Google AI Studio (gemini-2.5-flash), VERIFIER 1.
 *   - GroqClient      -> Groq (llama-3.3-70b-versatile),       VERIFIER 2.
 *
 * Why three providers: a single model can be cheerfully wrong about a
 * physics question. Three independent providers disagreeing is a strong
 * signal the question or the answer needs a human eye. Two-out-of-three
 * agreement gates auto-flagging. Three-out-of-three goes to SME review
 * either way -- the SME is always the final word.
 *
 * Why not the official SDKs: keeping pnpm-lock.yaml stable across deploys
 * is a stronger lever than the few QoL helpers the SDKs add. Direct fetch
 * to the documented HTTP endpoints is fine for our throughput.
 */

export interface LLMRequest {
  /** A short, human-readable name for the prompt template (logged). */
  promptName: string;
  /** System / instruction text. */
  system: string;
  /** User-facing prompt body. */
  user: string;
  /** Force JSON output. Each provider has its own JSON-mode flag. */
  json?: boolean;
  /** Sampling temperature in [0, 1]. */
  temperature?: number;
  /** Hard cap on response tokens. */
  maxTokens?: number;
}

export interface LLMResponse {
  /** The model id that actually served the request. */
  model: string;
  /** Raw text content. Already JSON-validated when `json: true` was set. */
  content: string;
  /** Best-effort token usage when the provider reports it. */
  inputTokens: number;
  outputTokens: number;
  /** Wall-clock latency. */
  latencyMs: number;
}

export interface LLMClient {
  /** Provider identifier used in log lines and verifier records. */
  readonly providerId: 'openai' | 'gemini' | 'groq';
  /** Default model id served by this client. */
  readonly modelId: string;
  complete(req: LLMRequest): Promise<LLMResponse>;
}

export class LLMRequestError extends Error {
  constructor(
    public readonly providerId: string,
    public readonly status: number,
    message: string,
  ) {
    super(`[${providerId} ${status}] ${message}`);
    this.name = 'LLMRequestError';
  }
}

/**
 * Light retry wrapper used by all three concrete clients.
 *
 * Retries 3 times with exponential backoff (250ms, 500ms, 1s) on:
 *   - 429 (rate limit)
 *   - 5xx
 *   - network errors
 *
 * 4xx other than 429 are surfaced immediately because they indicate a
 * configuration error (bad model name, malformed request) that retries
 * cannot fix.
 */
export async function fetchWithRetry(
  url: string,
  init: RequestInit,
  providerId: string,
): Promise<Response> {
  const delays = [250, 500, 1000];
  let lastErr: unknown;
  for (let attempt = 0; attempt <= delays.length; attempt++) {
    try {
      const res = await fetch(url, init);
      if (res.status === 429 || (res.status >= 500 && res.status <= 599)) {
        if (attempt === delays.length) return res;
        await new Promise((r) => setTimeout(r, delays[attempt]!));
        continue;
      }
      return res;
    } catch (e) {
      lastErr = e;
      if (attempt === delays.length) {
        throw new LLMRequestError(
          providerId,
          0,
          e instanceof Error ? e.message : 'network error',
        );
      }
      await new Promise((r) => setTimeout(r, delays[attempt]!));
    }
  }
  throw new LLMRequestError(
    providerId,
    0,
    lastErr instanceof Error ? lastErr.message : 'unknown',
  );
}

export type { LLMClient as default };
