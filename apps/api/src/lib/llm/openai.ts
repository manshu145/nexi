import type { z } from 'zod';
import { fetchWithTimeout, LLMError, stripJsonFence, type GenerateOptions, type LLMClient } from './types.js';

/**
 * OpenAI chat-completions client (gpt-4o-mini by default).
 *
 * Uses JSON mode (`response_format: { type: 'json_object' }`) so the model
 * is forced to return parseable JSON. We then validate against the caller's
 * Zod schema before returning.
 *
 * Docs: https://platform.openai.com/docs/api-reference/chat
 */
export class OpenAIClient implements LLMClient {
  public readonly modelId: string;

  constructor(
    private readonly apiKey: string,
    public readonly model: string = 'gpt-4o-mini',
  ) {
    this.modelId = `openai:${model}`;
  }

  async generate<T>(opts: GenerateOptions<T>): Promise<T> {
    const body = {
      model: this.model,
      messages: [
        { role: 'system', content: opts.systemPrompt },
        { role: 'user', content: opts.userPrompt },
      ],
      temperature: opts.temperature ?? 0.2,
      max_tokens: opts.maxTokens ?? 1000,
      response_format: { type: 'json_object' as const },
    };

    let res: Response;
    try {
      res = await fetchWithTimeout(
        'https://api.openai.com/v1/chat/completions',
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${this.apiKey}`,
          },
          body: JSON.stringify(body),
        },
        opts.timeoutMs ?? 30_000,
      );
    } catch (err) {
      throw new LLMError('openai: network error', err, this.modelId);
    }

    if (!res.ok) {
      const text = await safeText(res);
      throw new LLMError(`openai: HTTP ${res.status}: ${text}`, undefined, this.modelId);
    }

    const json = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const raw = json.choices?.[0]?.message?.content;
    if (!raw) {
      throw new LLMError('openai: empty response', undefined, this.modelId);
    }
    return parseJsonAgainstSchema(raw, opts.schema, this.modelId);
  }
}

async function safeText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return '<no body>';
  }
}

export function parseJsonAgainstSchema<T>(
  raw: string,
  schema: z.ZodSchema<T>,
  modelId: string,
): T {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripJsonFence(raw));
  } catch (err) {
    throw new LLMError(
      `${modelId}: response is not valid JSON. raw=${raw.slice(0, 200)}`,
      err,
      modelId,
    );
  }
  const result = schema.safeParse(parsed);
  if (!result.success) {
    throw new LLMError(
      `${modelId}: response failed schema validation: ${result.error.message}`,
      result.error,
      modelId,
    );
  }
  return result.data;
}
