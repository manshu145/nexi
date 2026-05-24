import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import type { ExamSlug, UserId } from '@nexigrate/shared';
import { requireAuth } from '../auth.js';
import type { AIEngine, StudentContext } from '../lib/aiEngine.js';
import type { UserStore } from '../lib/userStore.js';
import type { Logger } from '../logger.js';

export interface PersonalizedRoutesDeps {
  ai: AIEngine;
  users: UserStore;
  logger: Logger;
  openaiApiKey: string;
}

export function makePersonalizedRoutes(deps: PersonalizedRoutesDeps): Hono {
  const app = new Hono();

  async function getStudentContext(userId: UserId): Promise<StudentContext> {
    const user = await deps.users.get(userId);
    const profile = user as Record<string, unknown> | null;
    return {
      exam: (user?.targetExam ?? 'jee-main') as ExamSlug,
      skillLevel:
        (profile?.['skillLevel'] as StudentContext['skillLevel'] | undefined) ?? 'intermediate',
      weakSubjects: (profile?.['weakSubjects'] as string[] | undefined) ?? [],
      language: (profile?.['language'] as 'en' | 'hi' | undefined) ?? 'en',
    };
  }

  // Generate personalized MCQs on demand
  app.post('/mcqs', async (c) => {
    const principal = requireAuth(c);
    const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
    const subject = body?.['subject'] as string | undefined;
    const count = Math.min((body?.['count'] as number) || 10, 20);

    const ctx = await getStudentContext(principal.userId);
    const mcqs = await deps.ai.generateMcqs(ctx, count, subject);

    deps.logger.info('personalized.mcqs', { userId: principal.userId, count: mcqs.length });
    return c.json({ mcqs });
  });

  // Generate personalized chapter on demand
  app.post('/chapter', async (c) => {
    const principal = requireAuth(c);
    const body = await c.req.json().catch(() => null);
    const schema = z.object({ topic: z.string().min(2).max(200) });
    const parsed = schema.safeParse(body);
    if (!parsed.success) throw new HTTPException(400, { message: 'topic required' });

    const ctx = await getStudentContext(principal.userId);
    const chapter = await deps.ai.generateChapter(ctx, parsed.data.topic);

    deps.logger.info('personalized.chapter', {
      userId: principal.userId,
      topic: parsed.data.topic,
    });
    return c.json({ chapter });
  });

  // Generate mock test on demand
  app.post('/mock-test', async (c) => {
    const principal = requireAuth(c);
    const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
    const subject = body?.['subject'] as string | undefined;

    const ctx = await getStudentContext(principal.userId);
    const mcqs = await deps.ai.generateMcqs(ctx, 30, subject);

    deps.logger.info('personalized.mock-test', { userId: principal.userId });
    return c.json({
      id: `mock:${principal.userId}:${Date.now()}`,
      mcqs,
      durationMinutes: 60,
      totalQuestions: mcqs.length,
    });
  });

  // Nexipedia - real-time AI encyclopedia
  app.post('/nexipedia', async (c) => {
    const principal = requireAuth(c);
    const body = await c.req.json().catch(() => null);
    const schema = z.object({ topic: z.string().min(2).max(200) });
    const parsed = schema.safeParse(body);
    if (!parsed.success) throw new HTTPException(400, { message: 'topic required' });

    const ctx = await getStudentContext(principal.userId);
    const article = await deps.ai.generateNexipediaArticle(parsed.data.topic, ctx.language);

    deps.logger.info('personalized.nexipedia', {
      userId: principal.userId,
      topic: parsed.data.topic,
    });
    return c.json({ article });
  });

  // Visualize - generate Mermaid diagram
  app.post('/visualize', async (c) => {
    requireAuth(c);
    const body = await c.req.json().catch(() => null);
    const schema = z.object({ content: z.string().min(10).max(5000) });
    const parsed = schema.safeParse(body);
    if (!parsed.success) throw new HTTPException(400, { message: 'content required' });

    const prompt = `Create a Mermaid.js diagram that visualizes this content clearly:
"${parsed.data.content}"

Return ONLY valid Mermaid syntax. Use flowchart, sequence, or mindmap - whichever best represents the content. Keep it concise and readable.
Return JSON: { "mermaid": "..." , "title": "..." }`;

    const raw = await deps.ai.callGemini(prompt);
    let result: { mermaid: string; title: string };
    try {
      result = JSON.parse(raw) as { mermaid: string; title: string };
    } catch {
      result = { mermaid: raw, title: 'Visualization' };
    }

    return c.json({ diagram: result.mermaid, title: result.title });
  });

  // TTS - text to speech (returns audio URL or uses Web Speech API on client)
  app.post('/tts', async (c) => {
    const body = await c.req.json().catch(() => null);
    const schema = z.object({
      text: z.string().min(1).max(5000),
      language: z.enum(['en', 'hi']).default('en'),
    });
    const parsed = schema.safeParse(body);
    if (!parsed.success) throw new HTTPException(400, { message: 'text required' });

    // Return the text for client-side Web Speech API synthesis
    // (Google Cloud TTS can be added later for better quality)
    return c.json({
      text: parsed.data.text,
      language: parsed.data.language,
      engine: 'web-speech',
    });
  });

  // Chat with AI mentor
  app.post('/chat', async (c) => {
    const principal = requireAuth(c);
    const body = await c.req.json().catch(() => null);
    const schema = z.object({ message: z.string().min(1).max(2000) });
    const parsed = schema.safeParse(body);
    if (!parsed.success) throw new HTTPException(400, { message: 'message required' });

    const ctx = await getStudentContext(principal.userId);
    const lang = ctx.language === 'hi' ? 'Hindi' : 'English';

    const systemPrompt = `You are Nexigrate AI Mentor — a friendly, encouraging study buddy for Indian students preparing for ${ctx.exam}. 
The student's skill level is: ${ctx.skillLevel}.
Respond in ${lang}.
Be concise, clear, and helpful. Use examples relevant to Indian students.
If the student asks something outside academics, gently redirect them to study.
If they seem stressed, be supportive and suggest taking a break.`;

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${deps.openaiApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: parsed.data.message },
        ],
        temperature: 0.7,
        max_tokens: 500,
      }),
    });

    if (!res.ok) {
      return c.json({ reply: "Sorry, I'm having trouble connecting. Please try again." });
    }

    const data = (await res.json()) as {
      choices?: { message: { content: string } }[];
    };
    const reply = data.choices?.[0]?.message.content ?? "I couldn't generate a response.";

    return c.json({ reply });
  });

  return app;
}
