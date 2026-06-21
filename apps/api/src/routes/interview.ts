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
    const model = deps.env.GEMINI_LIVE_MODEL;
    const systemInstruction = buildSystemInstruction(body.role || '', body.exam || '', lang);

    try {
      const ai = new GoogleGenAI({ apiKey: deps.env.GEMINI_API_KEY, httpOptions: { apiVersion: 'v1alpha' } });
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

      deps.logger.info('interview.token_minted', { userId: principal.userId, model, lang });
      return c.json({ token: token.name, model, lang });
    } catch (err) {
      deps.logger.error('interview.token_failed', { error: err instanceof Error ? err.message : String(err) });
      throw new HTTPException(503, { message: 'Could not start the interview right now. Please try again.' });
    }
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
