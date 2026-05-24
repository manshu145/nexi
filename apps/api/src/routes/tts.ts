import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { requireAuth } from '../auth.js';
import type { Logger } from '../logger.js';

/**
 * Text-to-Speech endpoint.
 * Uses Google Cloud TTS API to convert educational text to speech.
 * Falls back to Web Speech API on the client if no API key configured.
 *
 * POST /v1/tts/synthesize — returns audio URL or signals client-side fallback
 */
export interface TtsDeps {
  logger: Logger;
  googleTtsApiKey?: string;
}

export function makeTtsRoutes(deps: TtsDeps): Hono {
  const app = new Hono();

  app.post('/synthesize', async (c) => {
    requireAuth(c);
    const body = await c.req.json().catch(() => null);
    if (!body || typeof body.text !== 'string' || !body.text.trim()) {
      throw new HTTPException(400, { message: 'text field required' });
    }

    const { text, language = 'en-IN' } = body as { text: string; language?: string };

    // If no Google TTS API key, signal client to use Web Speech API
    if (!deps.googleTtsApiKey) {
      return c.json({
        mode: 'client-side',
        text: text.slice(0, 5000),
        language,
        message: 'Use Web Speech API on client',
      });
    }

    // Call Google Cloud TTS
    try {
      const ttsResponse = await fetch(
        `https://texttospeech.googleapis.com/v1/text:synthesize?key=${deps.googleTtsApiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            input: { text: text.slice(0, 5000) },
            voice: {
              languageCode: language,
              name: getVoiceName(language),
              ssmlGender: 'FEMALE',
            },
            audioConfig: {
              audioEncoding: 'MP3',
              speakingRate: 0.9,
              pitch: 0,
            },
          }),
        },
      );

      if (!ttsResponse.ok) {
        deps.logger.warn('tts.google_failed', { status: ttsResponse.status });
        return c.json({ mode: 'client-side', text: text.slice(0, 5000), language });
      }

      const data = await ttsResponse.json() as { audioContent: string };
      return c.json({
        mode: 'server',
        audioBase64: data.audioContent,
        format: 'mp3',
        language,
      });
    } catch (err) {
      deps.logger.warn('tts.error', { error: String(err) });
      return c.json({ mode: 'client-side', text: text.slice(0, 5000), language });
    }
  });

  // GET /v1/tts/languages — supported languages
  app.get('/languages', async (c) => {
    requireAuth(c);
    return c.json({
      languages: [
        { code: 'en-IN', name: 'English (India)' },
        { code: 'hi-IN', name: 'Hindi' },
        { code: 'bn-IN', name: 'Bengali' },
        { code: 'ta-IN', name: 'Tamil' },
        { code: 'te-IN', name: 'Telugu' },
        { code: 'mr-IN', name: 'Marathi' },
        { code: 'gu-IN', name: 'Gujarati' },
        { code: 'kn-IN', name: 'Kannada' },
        { code: 'ml-IN', name: 'Malayalam' },
        { code: 'pa-IN', name: 'Punjabi' },
      ],
    });
  });

  return app;
}

function getVoiceName(language: string): string {
  const voices: Record<string, string> = {
    'en-IN': 'en-IN-Wavenet-A',
    'hi-IN': 'hi-IN-Wavenet-A',
    'bn-IN': 'bn-IN-Wavenet-A',
    'ta-IN': 'ta-IN-Wavenet-A',
    'te-IN': 'te-IN-Wavenet-A',
    'mr-IN': 'mr-IN-Wavenet-A',
    'gu-IN': 'gu-IN-Wavenet-A',
    'kn-IN': 'kn-IN-Wavenet-A',
    'ml-IN': 'ml-IN-Wavenet-A',
    'pa-IN': 'pa-IN-Wavenet-A',
  };
  return voices[language] ?? 'en-IN-Wavenet-A';
}
