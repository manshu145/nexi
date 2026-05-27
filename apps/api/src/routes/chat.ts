import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { requireAuth } from '../auth.js';
import type { Logger } from '../logger.js';
import type { UserStore } from '../lib/userStore.js';
import type { AIEngine } from '../lib/aiEngine.js';
import type { ChatStore } from '../lib/chatStore.js';
import type { Env } from '../env.js';

export interface ChatRoutesDeps { users: UserStore; aiEngine: AIEngine; chat: ChatStore; logger: Logger; env?: Env; }

export function makeChatRoutes(deps: ChatRoutesDeps): Hono {
  const app = new Hono();

  // POST /v1/chat — send message, get AI response (supports text + attachments)
  app.post('/', async (c) => {
    const principal = requireAuth(c);
    const body = await c.req.json().catch(() => null) as { message?: string; sessionId?: string; model?: 'gpt4o' | 'groq' | 'gemini'; attachments?: { type: 'image' | 'file'; name: string; data: string; mimeType?: string }[] } | null;
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
        response = await deps.aiEngine.chat(messages, userContext);
      }

      // Save AI response
      await deps.chat.addMessage(principal.userId, sessionId, 'assistant', response);

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
      const result = await deps.aiEngine.generateVisualization(body.topic, 'general', exam, 'image');
      deps.logger.info('chat.generate_image', { userId: principal.userId, topic: body.topic, type: result.type });
      return c.json({ type: result.type, content: result.content });
    } catch (err) {
      deps.logger.error('chat.generate_image_error', { error: err instanceof Error ? err.message : String(err) });
      throw new HTTPException(503, { message: 'Image generation failed. Try again.' });
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
  const langInstr = userContext.language === 'hi' ? 'Reply in Hindi (Devanagari script). Be concise.' : 'Reply in English. Be concise.';
  const systemText = `You are Nexi, an AI study mentor for Indian competitive exam students. Student is preparing for ${userContext.exam} at ${userContext.level} level. ${langInstr}

You can see images that the user sends. Analyze them carefully and provide educational insights.
- If it's a textbook page, extract key points and explain concepts
- If it's a question paper, solve and explain the answers
- If it's a diagram/chart, describe and explain what it shows
- If it's handwritten notes, read and organize them
- Always relate your answer to the student's exam preparation`;

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
            temperature: 0.7,
            maxOutputTokens: 2000,
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
