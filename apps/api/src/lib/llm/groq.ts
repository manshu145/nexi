import type { z } from 'zod';
import {
  fetchWithTimeout,
  LLMError,
  type GenerateOptions,
  type LLMClient,
} from './types.js';
import { parseJsonAgainstSchema } from './openai.js';

/**
 * Groq client.
 *
 * Groq is OpenAI-API-compatible at /openai/v1/chat/completions, so the wire
 * format is identical to the OpenAIClient with a different base URL.
 * llama-3.3-70b-versatile is the strongest open model on Groq's free tier
 * as of May 2026 with ~300 tok/s, much faster than OpenAI/Gemini.
 *
 * Docs: https://console.groq.com/docs
 */
export class GroqClient implements LLMClient {
  public readonly modelId: string;

  constructor(
    private readonly apiKey: string,
    public readonly model: string = 'llama-3.3-70b-versatile',
  ) {
    this.modelId = `groq:${model}`;
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
        'https://api.groq.com/openai/v1/chat/completions',
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
      throw new LLMError('groq: network error', err, this.modelId);
    }

    if (!res.ok) {
      let text = '';
      try {
        text = await res.text();
      } catch {
        text = '<no body>';
      }
      throw new LLMError(`groq: HTTP ${res.status}: ${text}`, undefined, this.modelId);
    }

    const json = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const raw = json.choices?.[0]?.message?.content;
    if (!raw) {
      throw new LLMError('groq: empty response', undefined, this.modelId);
    }
    return parseJsonAgainstSchema(raw, opts.schema, this.modelId);
  }
}
