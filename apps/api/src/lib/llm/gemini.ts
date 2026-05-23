import type { z } from 'zod';
import {
  fetchWithTimeout,
  LLMError,
  type GenerateOptions,
  type LLMClient,
} from './types.js';
import { parseJsonAgainstSchema } from './openai.js';

/**
 * Google Gemini client via the AI Studio REST API.
 *
 * Uses the `responseMimeType: 'application/json'` parameter so Gemini
 * returns strict JSON (no markdown fences, no surrounding prose).
 *
 * Free tier limits as of May 2026: 15 RPM / 1M TPM / 1500 RPD on
 * gemini-2.5-flash, which is plenty for our admin-triggered generation
 * during early beta.
 *
 * Docs: https://ai.google.dev/gemini-api/docs
 */
export class GeminiClient implements LLMClient {
  public readonly modelId: string;

  constructor(
    private readonly apiKey: string,
    public readonly model: string = 'gemini-2.5-flash',
  ) {
    this.modelId = `gemini:${model}`;
  }

  async generate<T>(opts: GenerateOptions<T>): Promise<T> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
      this.model,
    )}:generateContent?key=${encodeURIComponent(this.apiKey)}`;

    const body = {
      systemInstruction: { parts: [{ text: opts.systemPrompt }] },
      contents: [{ role: 'user', parts: [{ text: opts.userPrompt }] }],
      generationConfig: {
        temperature: opts.temperature ?? 0.2,
        maxOutputTokens: opts.maxTokens ?? 1000,
        responseMimeType: 'application/json',
      },
    };

    let res: Response;
    try {
      res = await fetchWithTimeout(
        url,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        },
        opts.timeoutMs ?? 30_000,
      );
    } catch (err) {
      throw new LLMError('gemini: network error', err, this.modelId);
    }

    if (!res.ok) {
      let text = '';
      try {
        text = await res.text();
      } catch {
        text = '<no body>';
      }
      throw new LLMError(`gemini: HTTP ${res.status}: ${text}`, undefined, this.modelId);
    }

    const json = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    const raw = json.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!raw) {
      throw new LLMError('gemini: empty response', undefined, this.modelId);
    }
    return parseJsonAgainstSchema(raw, opts.schema, this.modelId);
  }
}
