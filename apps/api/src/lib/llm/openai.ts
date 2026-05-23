import { fetchWithRetry, LLMRequestError, type LLMClient, type LLMRequest, type LLMResponse } from './index.js';

/**
 * OpenAI Chat Completions client.
 *
 * Endpoint: POST https://api.openai.com/v1/chat/completions
 * Docs:     https://platform.openai.com/docs/api-reference/chat
 *
 * We pin the model to `gpt-4o-mini` -- cheap, fast, and good enough for
 * generating exam-style MCQs with a clear rubric in the system prompt. If
 * we ever want a "premium" track we can add `gpt-4o` as a separate client.
 */
export class OpenAIClient implements LLMClient {
  readonly providerId = 'openai' as const;
  readonly modelId = 'gpt-4o-mini';

  constructor(private readonly apiKey: string) {
    if (!apiKey) {
      throw new Error('OpenAIClient: apiKey is empty. Set OPENAI_API_KEY.');
    }
  }

  async complete(req: LLMRequest): Promise<LLMResponse> {
    const start = Date.now();
    const res = await fetchWithRetry(
      'https://api.openai.com/v1/chat/completions',
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
