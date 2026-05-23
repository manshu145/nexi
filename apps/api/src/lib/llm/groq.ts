import { fetchWithRetry, LLMRequestError, type LLMClient, type LLMRequest, type LLMResponse } from './index.js';

/**
 * Groq (Llama) client.
 *
 * Endpoint: POST https://api.groq.com/openai/v1/chat/completions
 * Docs:     https://console.groq.com/docs/quickstart
 *
 * Groq's chat API is OpenAI-shape compatible, so the request body is the
 * same as the OpenAI client; only the URL and the auth header value change.
 *
 * We pick `llama-3.3-70b-versatile` for the verifier role: a different
 * model lineage from gpt-4o-mini and gemini-2.5-flash, which is the whole
 * point of the 3-AI cross-check. Groq's serving stack is also fast (<1s
 * for 1k tokens) so verification doesn't block the generator badly.
 */
export class GroqClient implements LLMClient {
  readonly providerId = 'groq' as const;
  readonly modelId = 'llama-3.3-70b-versatile';

  constructor(private readonly apiKey: string) {
    if (!apiKey) {
      throw new Error('GroqClient: apiKey is empty. Set GROQ_API_KEY.');
    }
  }

  async complete(req: LLMRequest): Promise<LLMResponse> {
    const start = Date.now();
    const res = await fetchWithRetry(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.modelId,
          messages: [
            { role: 'system', content: req.system },
            { role: 'user', content: req.user },
          ],
          temperature: req.temperature ?? 0.4,
          max_tokens: req.maxTokens ?? 1024,
          ...(req.json ? { response_format: { type: 'json_object' } } : {}),
        }),
      },
      this.providerId,
    );

    if (!res.ok) {
      const body = await res.text().catch(() => '<unreadable>');
      throw new LLMRequestError(this.providerId, res.status, body.slice(0, 500));
    }

    const data = (await res.json()) as {
      choices: { message: { content: string } }[];
      usage?: { prompt_tokens: number; completion_tokens: number };
    };

    const content = data.choices[0]?.message?.content ?? '';
    return {
      model: this.modelId,
      content,
      inputTokens: data.usage?.prompt_tokens ?? 0,
      outputTokens: data.usage?.completion_tokens ?? 0,
      latencyMs: Date.now() - start,
    };
  }
}
