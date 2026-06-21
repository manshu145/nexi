import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { requireAuth } from '../auth.js';
import type { Logger } from '../logger.js';
import type { UserStore } from '../lib/userStore.js';
import type { AIEngine } from '../lib/aiEngine.js';
import type { ChatStore } from '../lib/chatStore.js';
import type { Env } from '../env.js';
import type { PlatformConfigStore } from '../lib/platformConfigStore.js';
import type { FeatureUsageStore } from '../lib/featureUsageStore.js';
import type { CreditLedger } from '../lib/creditLedger.js';
import { PlanGate, FeatureKey } from '../lib/planGate.js';

export interface ChatRoutesDeps { users: UserStore; aiEngine: AIEngine; chat: ChatStore; logger: Logger; env?: Env; config?: PlatformConfigStore; usage?: FeatureUsageStore; ledger?: CreditLedger; }

/** Free-tier AI-SUPPORT allowance: messages per IST hour. Support stays on a
 *  separate, generous hourly bucket (not credit-gated) so a user who has run
 *  out of tutor credits can ALWAYS still reach help. */
const FREE_AI_SUPPORT_PER_HOUR = 20;

export function makeChatRoutes(deps: ChatRoutesDeps): Hono {
  const app = new Hono();
  // Central plan/feature gate (AI tutor + image quotas). Needs config + usage
  // + ledger; falls back to no gating (fail-open) when any is missing.
  const planGate = deps.config && deps.usage && deps.ledger
    ? new PlanGate({ config: deps.config, usage: deps.usage, ledger: deps.ledger, logger: deps.logger })
    : null;

  // POST /v1/chat — send message, get AI response (supports text + attachments)
  app.post('/', async (c) => {
    const principal = requireAuth(c);
    const body = await c.req.json().catch(() => null) as { message?: string; sessionId?: string; model?: 'gpt4o' | 'groq' | 'gemini'; attachments?: { type: 'image' | 'file'; name: string; data: string; mimeType?: string }[]; supportMode?: boolean } | null;
    if (!body?.message) throw new HTTPException(400, { message: 'message is required' });

    try {
      const user = await deps.users.get(principal.userId);
      let sessionId = body.sessionId;

      // Create session if none provided
      if (!sessionId) {
        sessionId = await deps.chat.createSession(principal.userId, body.message);
      }

      // Add user message
      await deps.chat.addMessage(principal.userId, sessionId, 'user', body.message);

      // Get session history for context
      const session = await deps.chat.getSession(principal.userId, sessionId);
      const messages = (session?.messages ?? []).map(m => ({ role: m.role, content: m.content }));

      // ── AI-tutor / support gating ──────────────────────────────────────
      // Support chat stays on a free, generous hourly bucket so a user out of
      // tutor credits can ALWAYS still reach help. The AI tutor goes through
      // the central planGate: Free/expired pay credits (charged only on a
      // successful reply), active paid users get the per-day aiTutorPerDay
      // cap. Every limit returns an upgrade-prompting message. Fail-open.
      const supportMode = body.supportMode === true;
      const lang = user?.language ?? 'en';
      let aiChatCommit: () => Promise<void> = async () => {};

      if (supportMode) {
        if (deps.usage) {
          try {
            const usedThisHour = await deps.usage.getCount(principal.userId, 'aiSupport', 'hour');
            if (usedThisHour >= FREE_AI_SUPPORT_PER_HOUR) {
              const limitMsg = lang === 'hi'
                ? `आपने इस घंटे के सपोर्ट संदेशों की सीमा पूरी कर ली है। कृपया थोड़ी देर बाद कोशिश करें, या नीचे एक टिकट बनाएँ / help@nexigrate.com पर ईमेल करें।`
                : `You've reached the support message limit for this hour. Please try again shortly, or create a ticket below / email help@nexigrate.com.`;
              await deps.chat.addMessage(principal.userId, sessionId, 'assistant', limitMsg);
              deps.logger.info('chat.support_limit_hit', { userId: principal.userId, usedThisHour });
              return c.json({ sessionId, response: limitMsg, title: session?.title ?? body.message.slice(0, 50), limitReached: true });
            }
          } catch (limitErr) {
            deps.logger.warn('chat.support_limit_check_failed', { error: limitErr instanceof Error ? limitErr.message : String(limitErr) });
          }
        }
      } else if (planGate) {
        const gate = await planGate.enforce(user, FeatureKey.AI_CHAT, lang as 'en' | 'hi', { deferCredits: true });
        if (!gate.ok) {
          await deps.chat.addMessage(principal.userId, sessionId, 'assistant', gate.body.message);
          deps.logger.info('chat.tutor_limit_hit', { userId: principal.userId, reason: gate.body.error, plan: gate.body.plan });
          return c.json({ sessionId, response: gate.body.message, title: session?.title ?? body.message.slice(0, 50), limitReached: true, upgrade: true, gate: gate.body });
        }
        aiChatCommit = gate.commit;
      }

      const userContext = { exam: user?.targetExam ?? 'general', level: user?.onboardingLevel ?? 'intermediate', language: (user?.language ?? 'en') as 'en' | 'hi' };

      let response: string;

      // If image attachments present, use Gemini Vision (multimodal)
      const imageAttachments = body.attachments?.filter(a => a.type === 'image' && a.data) ?? [];
      if (imageAttachments.length > 0 && deps.env?.GEMINI_API_KEY) {
        response = await chatWithGeminiVision(
          body.message,
          imageAttachments,
          userContext,
          deps.env.GEMINI_API_KEY,
          deps.logger
        );
      } else {
        // If file attachments (non-image), append description to the last user message
        if (body.attachments && body.attachments.length > 0 && imageAttachments.length === 0) {
          const attachmentDesc = body.attachments.map(a => {
            return `[User attached a file: ${a.name} (${a.mimeType ?? 'unknown type'}). Consider this in your response.]`;
          }).join('\n');
          const lastMsg = messages[messages.length - 1];
          if (lastMsg && lastMsg.role === 'user') {
            lastMsg.content = `${lastMsg.content}\n\n${attachmentDesc}`;
          }
        }

        // Call AI (text-only)
        response = await deps.aiEngine.chat(messages, userContext, body.model);
        // Track AI cost for per-user daily cap (lock §3.8). ~$0.005 per
        // gpt-4o chat exchange; conservative estimate covers all 3
        // providers without requiring per-provider attribution.
        await deps.aiEngine.recordAICost(principal.userId, 0.005);
      }

      // Save AI response
      await deps.chat.addMessage(principal.userId, sessionId, 'assistant', response);

      // Record usage on success only (a failed generation costs nothing):
      // support → free hourly counter; tutor → planGate commit (credits for
      // Free/expired, per-day count for active paid plans).
      if (supportMode) {
        if (deps.usage) await deps.usage.increment(principal.userId, 'aiSupport', 'hour');
      } else {
        await aiChatCommit();
      }

      deps.logger.info('chat.response', { userId: principal.userId, sessionId, responseLen: response.length, hasImage: imageAttachments.length > 0 });
      return c.json({ sessionId, response, title: session?.title ?? body.message.slice(0, 50) });
    } catch (err) {
      if (err instanceof HTTPException) throw err;
      deps.logger.error('chat.error', { error: err instanceof Error ? err.message : String(err) });
      throw new HTTPException(503, { message: 'AI is busy. Please try again.' });
    }
  });

  // GET /v1/chat/history — all sessions
  app.get('/history', async (c) => {
    const principal = requireAuth(c);
    const sessions = await deps.chat.getSessions(principal.userId);
    return c.json({ sessions });
  });

  // GET /v1/chat/history/:sessionId — specific session
  app.get('/history/:sessionId', async (c) => {
    const principal = requireAuth(c);
    const sessionId = c.req.param('sessionId');
    const session = await deps.chat.getSession(principal.userId, sessionId);
    if (!session) throw new HTTPException(404, { message: 'Session not found' });
    return c.json({ session });
  });

  // DELETE /v1/chat/history/all — delete all sessions
  app.delete('/history/all', async (c) => {
    const principal = requireAuth(c);
    await deps.chat.deleteAllSessions(principal.userId);
    deps.logger.info('chat.delete_all', { userId: principal.userId });
    return c.json({ success: true });
  });

  // DELETE /v1/chat/history/:sessionId — delete session
  app.delete('/history/:sessionId', async (c) => {
    const principal = requireAuth(c);
    const sessionId = c.req.param('sessionId');
    await deps.chat.deleteSession(principal.userId, sessionId);
    return c.json({ success: true });
  });

  // POST /v1/chat/generate-image — generate an educational image/diagram
  app.post('/generate-image', async (c) => {
    const principal = requireAuth(c);
    const body = await c.req.json().catch(() => null) as { topic?: string } | null;
    if (!body?.topic) throw new HTTPException(400, { message: 'topic is required' });

    try {
      const user = await deps.users.get(principal.userId);
      const exam = user?.targetExam ?? 'general';
      const lang = (user?.language ?? 'en') as 'en' | 'hi';

      // Per-day image-generation cap via the central gate (imagesPerDay;
      // -1 = unlimited, 0 = not included). Expiry-aware. Founder ask: "limit
      // laga to message bhi milna chahiye" — blocked calls return an upgrade
      // prompt. Fail-open if the gate isn't wired.
      let imageCommit: () => Promise<void> = async () => {};
      if (planGate) {
        const gate = await planGate.enforce(user, FeatureKey.AI_IMAGE, lang);
        if (!gate.ok) {
          deps.logger.info('chat.image_limit_hit', { userId: principal.userId, reason: gate.body.error, plan: gate.body.plan });
          return c.json({
            type: 'mermaid',
            content: `graph TD\n  A["Daily image limit reached"] --> B["Upgrade for more images"]`,
            fallback: true,
            limitReached: true,
            upgrade: true,
            gate: gate.body,
            message: gate.body.message,
          });
        }
        imageCommit = gate.commit;
      }

      const result = await deps.aiEngine.generateVisualization(body.topic, 'general', exam, 'image');
      // Count a successful image against the daily quota.
      if (result.type === 'image') {
        await imageCommit();
      }
      deps.logger.info('chat.generate_image', { userId: principal.userId, topic: body.topic, type: result.type });
      return c.json({ type: result.type, content: result.content });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      deps.logger.error('chat.generate_image_error', { error: errMsg, topic: body.topic, userId: principal.userId });
      // Return a mermaid fallback instead of failing — never show error to student
      return c.json({ type: 'mermaid', content: `graph TD\n  A["${body.topic}"] --> B[Image generation unavailable]\n  B --> C[Try again later]`, fallback: true, message: 'Image generation is temporarily unavailable. Showing a diagram instead.' });
    }
  });

  return app;
}

/**
 * Chat with Gemini 2.0 Flash using vision (multimodal) - can actually SEE images.
 * Uses the Gemini API with inlineData parts for image understanding.
 */
async function chatWithGeminiVision(
  message: string,
  imageAttachments: { type: 'image' | 'file'; name: string; data: string; mimeType?: string }[],
  userContext: { exam: string; level: string; language: 'en' | 'hi' },
  geminiApiKey: string,
  logger: Logger,
): Promise<string> {
  const langInstr = userContext.language === 'hi' ? 'Reply in Hindi (Devanagari script).' : 'Reply in English.';
  const systemText = `You are Nexi, an AI study mentor for Indian competitive exam students. Student is preparing for ${userContext.exam} at ${userContext.level} level. ${langInstr}

You can SEE the image(s) the student sends. This is most often a PHOTO OF A DOUBT/QUESTION they're stuck on. Analyse carefully and help them learn.

If the image contains a QUESTION or problem (MCQ, numerical, diagram-based, passage):
1. **Restate the question** briefly so they know you read it correctly.
2. **Solve it step by step** — show the reasoning/working clearly, one step per line. For MCQs, explain why the correct option is right AND why the key distractors are wrong.
3. **State the final answer** in bold on its own line (e.g. "**Answer: C**").
4. Add a short **tip / concept to remember** for the exam.

For other images: textbook page → extract & explain key points; diagram/chart → describe & explain; handwritten notes → read & organise.

Use simple language and clear formatting (headings, numbered steps, bold for the answer). Always tie it back to ${userContext.exam} preparation. If the image is blurry or unreadable, say exactly what you cannot read and ask for a clearer photo.`;

  // Build multimodal parts for Gemini
  const parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> = [];

  // Add system instruction + user message as text
  parts.push({ text: `${systemText}\n\nUser's message: ${message}` });

  // Add each image as inlineData
  for (const img of imageAttachments) {
    // The data comes as a data URL (data:image/png;base64,...) — extract the base64 part
    let base64Data = img.data;
    let mimeType = img.mimeType ?? 'image/jpeg';

    if (base64Data.startsWith('data:')) {
      const match = base64Data.match(/^data:([^;]+);base64,(.+)$/);
      if (match) {
        mimeType = match[1]!;
        base64Data = match[2]!;
      }
    }

    parts.push({
      inlineData: {
        mimeType,
        data: base64Data,
      },
    });
  }

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiApiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts }],
          generationConfig: {
            temperature: 0.5,
            maxOutputTokens: 3000,
          },
        }),
      }
    );

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      logger.error('chat.gemini_vision_http_error', { status: res.status, body: errText.slice(0, 300) });
      throw new Error(`Gemini Vision API error: ${res.status}`);
    }

    const data = await res.json() as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };

    const responseText = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    if (!responseText) {
      throw new Error('Gemini Vision returned empty response');
    }

    logger.info('chat.gemini_vision_success', { responseLen: responseText.length, imageCount: imageAttachments.length });
    return responseText;
  } catch (err) {
    logger.error('chat.gemini_vision_failed', { error: err instanceof Error ? err.message : String(err) });
    throw new Error('Image analysis failed. Please try again.');
  }
}
