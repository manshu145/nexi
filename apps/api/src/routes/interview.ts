/**
 * Live Interview routes (Elite-plan feature).
 *
 * A real-time AI interviewer built on the Gemini Live API. The browser opens
 * camera + mic and streams to Gemini Live, which "sees" and "hears" the
 * candidate and replies with natural voice in real time. To keep the
 * GEMINI_API_KEY off the client, the browser NEVER gets the real key — it
 * gets a short-lived EPHEMERAL TOKEN minted here (locked to the Live model +
 * interviewer system instruction). Gated to the 'achiever' (Elite) plan to
 * control per-minute cost.
 *
 * Endpoints:
 *   POST /v1/interview/token   → Elite-only ephemeral Live API token
 *   POST /v1/interview/report  → scorecard from the finished transcript
 */
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { GoogleGenAI, Modality } from '@google/genai';
import { requireAuth } from '../auth.js';
import { effectivePlanId } from '../lib/planGate.js';
import { asUserId } from '@nexigrate/shared';
import type { UserStore } from '../lib/userStore.js';
import type { AIEngine } from '../lib/aiEngine.js';
import type { Env } from '../env.js';
import type { Logger } from '../logger.js';

export interface InterviewRoutesDeps {
  users: UserStore;
  aiEngine: AIEngine;
  env: Env;
  logger: Logger;
}

const ELITE_PLAN = 'achiever';

/**
 * List the model names that actually support the Live API (bidiGenerateContent)
 * for THIS key, on a given API version. Uses the raw REST ListModels endpoint
 * (the v1beta/v1alpha response exposes `supportedGenerationMethods`). Returns
 * bare model ids (without the leading `models/`). Never throws — returns [].
 */
async function listLiveModels(apiKey: string, apiVersion: string): Promise<string[]> {
  try {
    const url = `https://generativelanguage.googleapis.com/${apiVersion}/models?key=${apiKey}&pageSize=1000`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = (await res.json()) as { models?: Array<{ name?: string; supportedGenerationMethods?: string[] }> };
    return (data.models ?? [])
      .filter((m) => (m.supportedGenerationMethods ?? []).includes('bidiGenerateContent'))
      .map((m) => (m.name ?? '').replace(/^models\//, ''))
      .filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * Pick the best Live model from those available to this key on v1alpha (the
 * version the browser connects with). Preference: the configured model if it's
 * actually available → a half-cascade `*-live-*` model (most reliable for the
 * text kick-off) → a native-audio model → anything else. Falls back to the
 * configured model name if discovery fails, so the feature still attempts.
 */
function pickLiveModel(configured: string, available: string[]): string {
  if (available.length === 0) return configured;
  if (available.includes(configured)) return configured;
  return (
    available.find((m) => /-live-/.test(m) && !/native-audio/.test(m)) ||
    available.find((m) => /live/.test(m)) ||
    available.find((m) => /native-audio/.test(m)) ||
    available[0] ||
    configured
  );
}

function buildSystemInstruction(role: string, exam: string, lang: 'en' | 'hi'): string {
  const langLine = lang === 'hi'
    ? 'Conduct the interview primarily in Hindi (you may use common English terms). Keep a warm but professional tone.'
    : 'Conduct the interview in clear, simple English. Keep a warm but professional tone.';
  return [
    `You are a professional interview panelist conducting a realistic mock interview${exam ? ` for ${exam}` : ''}${role ? ` (focus area: ${role})` : ''}.`,
    langLine,
    'Behave like a real human interviewer:',
    '- Greet the candidate briefly, then ask ONE question at a time and WAIT for the full answer.',
    '- Ask natural follow-ups based on what they say; probe shallow answers gently.',
    '- Mix introduction, subject/role questions, situational and a couple of pressure questions.',
    '- Keep your turns short and conversational (you are speaking out loud).',
    '- Do NOT give feedback or scores during the interview — only at the very end if asked.',
    '- Keep the whole interview to roughly 8-10 questions.',
    'Start now by greeting the candidate and asking them to introduce themselves.',
  ].join('\n');
}

export function makeInterviewRoutes(deps: InterviewRoutesDeps): Hono {
  const app = new Hono();

  const requireElite = async (userId: string) => {
    const user = await deps.users.get(asUserId(userId));
    if (effectivePlanId(user) !== ELITE_PLAN) {
      throw new HTTPException(403, {
        message: JSON.stringify({
          error: 'Live Interview is an Elite-plan feature.',
          feature: 'live-interview',
          upgrade: true,
          message: 'Upgrade to Elite to practice with the live AI interviewer.',
        }),
      });
    }
  };

  // POST /v1/interview/token — mint a short-lived ephemeral Live API token.
  app.post('/token', async (c) => {
    const principal = requireAuth(c);
    await requireElite(principal.userId);

    if (!deps.env.GEMINI_API_KEY) {
      throw new HTTPException(503, { message: 'Live Interview is temporarily unavailable.' });
    }

    const body = await c.req.json().catch(() => ({})) as { role?: string; exam?: string; lang?: 'en' | 'hi' };
    const lang: 'en' | 'hi' = body.lang === 'hi' ? 'hi' : 'en';
    const systemInstruction = buildSystemInstruction(body.role || '', body.exam || '', lang);

    try {
      const ai = new GoogleGenAI({ apiKey: deps.env.GEMINI_API_KEY, httpOptions: { apiVersion: 'v1alpha' } });

      // Resolve a model that this key can actually use for the Live API on
      // v1alpha — model names/availability change over time, so we discover
      // instead of trusting a hard-coded name that may have been retired.
      const available = await listLiveModels(deps.env.GEMINI_API_KEY, 'v1alpha');
      const model = pickLiveModel(deps.env.GEMINI_LIVE_MODEL, available);

      const now = Date.now();
      const token = await ai.authTokens.create({
        config: {
          uses: 1, // single session
          expireTime: new Date(now + 30 * 60 * 1000).toISOString(),       // 30 min to talk
          newSessionExpireTime: new Date(now + 2 * 60 * 1000).toISOString(), // 2 min to start
          liveConnectConstraints: {
            model,
            config: {
              responseModalities: [Modality.AUDIO],
              systemInstruction: { parts: [{ text: systemInstruction }] },
              temperature: 0.8,
            },
          },
          httpOptions: { apiVersion: 'v1alpha' },
        },
      });

      deps.logger.info('interview.token_minted', { userId: principal.userId, model, lang, availableCount: available.length });
      return c.json({ token: token.name, model, lang, availableModels: available });
    } catch (err) {
      deps.logger.error('interview.token_failed', { error: err instanceof Error ? err.message : String(err) });
      throw new HTTPException(503, { message: 'Could not start the interview right now. Please try again.' });
    }
  });

  // GET /v1/interview/models — diagnostic: which Live models this key can use.
  app.get('/models', async (c) => {
    const principal = requireAuth(c);
    await requireElite(principal.userId);
    if (!deps.env.GEMINI_API_KEY) {
      throw new HTTPException(503, { message: 'Live Interview is temporarily unavailable.' });
    }
    const [v1alpha, v1beta] = await Promise.all([
      listLiveModels(deps.env.GEMINI_API_KEY, 'v1alpha'),
      listLiveModels(deps.env.GEMINI_API_KEY, 'v1beta'),
    ]);
    return c.json({
      configured: deps.env.GEMINI_LIVE_MODEL,
      resolved: pickLiveModel(deps.env.GEMINI_LIVE_MODEL, v1alpha),
      v1alpha,
      v1beta,
    });
  });

  // POST /v1/interview/report — turn the finished transcript into a scorecard.
  app.post('/report', async (c) => {
    const principal = requireAuth(c);
    await requireElite(principal.userId);

    const body = await c.req.json().catch(() => null) as { transcript?: string; role?: string; exam?: string; lang?: 'en' | 'hi' } | null;
    if (!body?.transcript || body.transcript.trim().length < 20) {
      throw new HTTPException(400, { message: 'Transcript too short to evaluate.' });
    }

    const report = await deps.aiEngine.generateInterviewReport(body.transcript, {
      ...(body.role ? { role: body.role } : {}),
      ...(body.exam ? { exam: body.exam } : {}),
      language: body.lang === 'hi' ? 'hi' : 'en',
    });

    deps.logger.info('interview.report_generated', { userId: principal.userId, overall: report.overall });
    return c.json({ report });
  });

  return app;
}
