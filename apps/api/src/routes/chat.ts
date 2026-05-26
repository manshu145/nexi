import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { requireAuth } from '../auth.js';
import type { Logger } from '../logger.js';
import type { UserStore } from '../lib/userStore.js';
import type { AIEngine } from '../lib/aiEngine.js';
import type { ChatStore } from '../lib/chatStore.js';

export interface ChatRoutesDeps { users: UserStore; aiEngine: AIEngine; chat: ChatStore; logger: Logger; }

export function makeChatRoutes(deps: ChatRoutesDeps): Hono {
  const app = new Hono();

  // POST /v1/chat — send message, get AI response (supports text + attachments)
  app.post('/', async (c) => {
    const principal = requireAuth(c);
    const body = await c.req.json().catch(() => null) as { message?: string; sessionId?: string; attachments?: { type: 'image' | 'file'; name: string; data: string; mimeType?: string }[] } | null;
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

      // If attachments present, append description to the last user message for AI context
      if (body.attachments && body.attachments.length > 0) {
        const attachmentDesc = body.attachments.map(a => {
          if (a.type === 'image') return `[User attached an image: ${a.name}. Describe and answer based on this image.]`;
          return `[User attached a file: ${a.name} (${a.mimeType ?? 'unknown type'}). Consider this in your response.]`;
        }).join('\n');
        const lastMsg = messages[messages.length - 1];
        if (lastMsg && lastMsg.role === 'user') {
          lastMsg.content = `${lastMsg.content}\n\n${attachmentDesc}`;
        }
      }

      // Call AI
      const userContext = { exam: user?.targetExam ?? 'general', level: user?.onboardingLevel ?? 'intermediate', language: (user?.language ?? 'en') as 'en' | 'hi' };
      const response = await deps.aiEngine.chat(messages, userContext);

      // Save AI response
      await deps.chat.addMessage(principal.userId, sessionId, 'assistant', response);

      deps.logger.info('chat.response', { userId: principal.userId, sessionId, responseLen: response.length });
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

  // DELETE /v1/chat/history/:sessionId — delete session
  app.delete('/history/:sessionId', async (c) => {
    const principal = requireAuth(c);
    const sessionId = c.req.param('sessionId');
    await deps.chat.deleteSession(principal.userId, sessionId);
    return c.json({ success: true });
  });

  return app;
}
