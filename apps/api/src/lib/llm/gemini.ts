import { fetchWithRetry, LLMRequestError, type LLMClient, type LLMRequest, type LLMResponse } from './index.js';

/**
 * Google AI Studio Gemini client.
 *
 * Endpoint: POST https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent
 * Docs:     https://ai.google.dev/api/generate-content
 *
 * Gemini auth is `?key=...` query param, NOT Authorization header. The API
 * key is created at https://aistudio.google.com/app/apikey and is account-
 * scoped (not GCP-project-scoped) so it works without the user provisioning
 * a separate GCP service.
 */
export class GeminiClient implements LLMClient {
  readonly providerId = 'gemini' as const;
  readonly modelId = 'gemini-2.5-flash';

  constructor(private readonly apiKey: string) {
    if (!apiKey) {
      throw new Error('GeminiClient: apiKey is empty. Set GEMINI_API_KEY.');
    }
  }

  async complete(req: LLMRequest): Promise<LLMResponse> {
    const start = Date.now();
    const url =
      `https://generativelanguage.googleapis.com/v1beta/models/${this.modelId}:generateContent?key=${encodeURIComponent(this.apiKey)}`;

    const res = await fetchWithRetry(
      url,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          // Gemini doesn't have an explicit "system" role; we prepend the
          // system text to the first user message via systemInstruction.
          systemInstruction: { role: 'system', parts: [{ text: req.system }] },
          contents: [{ role: 'user', parts: [{ text: req.user }] }],
          generationConfig: {
            temperature: req.temperature ?? 0.4,
            maxOutputTokens: req.maxTokens ?? 1024,
            ...(req.json ? { responseMimeType: 'application/json' } : {}),
          },
        }),
      },
      this.providerId,
    );

    if (!res.ok) {
      const body = await res.text().catch(() => '<unreadable>');
      throw new LLMRequestError(this.providerId, res.status, body.slice(0, 500));
    }

    const data = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
      usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
    };

    const content = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    return {
      model: this.modelId,
      content,
      inputTokens: data.usageMetadata?.promptTokenCount ?? 0,
      outputTokens: data.usageMetadata?.candidatesTokenCount ?? 0,
      latencyMs: Date.now() - start,
    };
  }
}
