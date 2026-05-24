/**
 * AI Routes — personalized AI-driven study endpoints.
 *
 * POST /syllabus            — Generate syllabus for a given exam
 * POST /assess/generate     — Generate assessment MCQs
 * POST /assess/submit       — Submit assessment and get skill analysis
 * GET  /progress            — Get student progress
 * POST /progress/update     — Update topic progress
 * POST /chapter             — Generate a chapter for a topic
 * POST /mock-test           — Generate mock test MCQs
 * POST /final-test          — Generate final comprehensive test
 * GET  /current-affairs     — Get current affairs digest
 * POST /chat                — Chat with Nexi AI
 * GET  /chat/history        — Get chat history
 * DELETE /chat/history      — Clear chat history
 */

import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import type { ExamSlug } from '@nexigrate/shared';
import { requireAuth } from '../auth.js';
import type { AIEngine } from '../lib/aiEngine.js';
import type { UserStore } from '../lib/userStore.js';
import type {
  StudentProgressStore,
  ChatHistoryStore,
  StudentProgress,
  ChatMessageRecord,
} from '../lib/chapterStore.js';
import type { Logger } from '../logger.js';

export interface AIRoutesDeps {
  ai: AIEngine;
  users: UserStore;
  progressStore: StudentProgressStore;
  chatStore: ChatHistoryStore;
  logger: Logger;
  openaiApiKey?: string;
}

export function makeAIRoutes(deps: AIRoutesDeps): Hono {
  const { ai, users, progressStore, chatStore, logger } = deps;
  const app = new Hono();

  // ─── Helper ──────────────────────────────────────────────────────────────

  async function getUserLanguage(userId: string): Promise<'en' | 'hi'> {
    const user = await users.get(userId as any);
    const profile = user as Record<string, unknown> | null;
    return (profile?.['preferredLanguage'] as 'en' | 'hi' | undefined) ?? 'en';
  }

  async function getUserExam(userId: string): Promise<string> {
    const user = await users.get(userId as any);
    return (user?.targetExam ?? 'upsc-cse') as string;
  }

  // ─── POST /syllabus ──────────────────────────────────────────────────────

  app.post('/syllabus', async (c) => {
    const principal = requireAuth(c);
    const body = await c.req.json().catch(() => ({})) as Record<string, unknown>;
    const exam = (body['exam'] as string) || (await getUserExam(principal.userId));
    const language = (body['language'] as 'en' | 'hi') || (await getUserLanguage(principal.userId));

    const syllabus = await ai.generateSyllabus({ exam: exam as ExamSlug, skillLevel: 'intermediate', weakSubjects: [], language }, exam);

    logger.info('ai.syllabus', { userId: principal.userId, exam });
    return c.json({ syllabus });
  });

  // ─── POST /assess/generate ───────────────────────────────────────────────

  app.post('/assess/generate', async (c) => {
    const principal = requireAuth(c);
    const body = await c.req.json().catch(() => ({})) as Record<string, unknown>;
    const exam = (body['exam'] as string) || (await getUserExam(principal.userId));
    const count = Math.min(Math.max((body['count'] as number) || 15, 5), 30);
    const language = (body['language'] as 'en' | 'hi') || (await getUserLanguage(principal.userId));

    try {
      const mcqs = await ai.generateAssessmentMcqs(exam, count, language);
      logger.info('ai.assess.generate', { userId: principal.userId, exam, count: mcqs.length });
      return c.json({ mcqs });
    } catch (err) {
      logger.error('ai.assess.generate.error', { userId: principal.userId, error: (err as Error).message });
      throw new HTTPException(503, { message: 'AI service unavailable. Please try again in a moment.' });
    }
  });

  // ─── POST /assess/submit ─────────────────────────────────────────────────

  app.post('/assess/submit', async (c) => {
    const principal = requireAuth(c);
    const body = await c.req.json().catch(() => null);
    const schema = z.object({
      exam: z.string().min(1),
      mcqs: z.array(z.object({
        question: z.string(),
        options: z.array(z.object({ key: z.string(), text: z.string() })),
        correctOption: z.string(),
        explanation: z.string(),
        subject: z.string(),
        difficulty: z.string(),
      })),
      answers: z.array(z.string().nullable()),
    });

    const parsed = schema.safeParse(body);
    if (!parsed.success) throw new HTTPException(400, { message: 'Invalid submission data' });

    const { exam, mcqs, answers } = parsed.data;
    const result = ai.assessStudent(mcqs as any, answers);

    // Save progress
    const language = await getUserLanguage(principal.userId);
    const progress: StudentProgress = {
      userId: principal.userId,
      exam: exam as ExamSlug,
      skillLevel: result.skillLevel,
      weakSubjects: result.weakSubjects,
      strongSubjects: result.strongSubjects,
      language,
      syllabus: [],
      overallScore: result.score,
      totalTopicsCompleted: 0,
      totalTopics: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await progressStore.setProgress(principal.userId, progress);

    logger.info('ai.assess.submit', { userId: principal.userId, exam, score: result.score, level: result.skillLevel });
    return c.json({ result, progress });
  });

  // ─── GET /progress ───────────────────────────────────────────────────────

  app.get('/progress', async (c) => {
    const principal = requireAuth(c);
    const progress = await progressStore.getProgress(principal.userId);
    if (!progress) return c.json({ progress: null });
    return c.json({ progress });
  });

  // ─── POST /progress/update ───────────────────────────────────────────────

  app.post('/progress/update', async (c) => {
    const principal = requireAuth(c);
    const body = await c.req.json().catch(() => ({})) as Record<string, unknown>;

    const existing = await progressStore.getProgress(principal.userId);
    if (!existing) throw new HTTPException(404, { message: 'No progress found. Complete assessment first.' });

    const updates: Partial<StudentProgress> = {};
    if (body['syllabus']) updates.syllabus = body['syllabus'] as any;
    if (body['totalTopicsCompleted'] !== undefined) updates.totalTopicsCompleted = body['totalTopicsCompleted'] as number;
    if (body['totalTopics'] !== undefined) updates.totalTopics = body['totalTopics'] as number;
    if (body['overallScore'] !== undefined) updates.overallScore = body['overallScore'] as number;

    await progressStore.updateProgress(principal.userId, updates);

    logger.info('ai.progress.update', { userId: principal.userId });
    return c.json({ ok: true });
  });

  // ─── POST /chapter ───────────────────────────────────────────────────────

  app.post('/chapter', async (c) => {
    const principal = requireAuth(c);
    const body = await c.req.json().catch(() => null);
    const schema = z.object({
      topic: z.string().min(2).max(200),
      subject: z.string().optional(),
      language: z.enum(['en', 'hi']).optional(),
    });
    const parsed = schema.safeParse(body);
    if (!parsed.success) throw new HTTPException(400, { message: 'topic required' });

    const progress = await progressStore.getProgress(principal.userId);
    const exam = progress?.exam ?? (await getUserExam(principal.userId));
    const language = parsed.data.language ?? progress?.language ?? (await getUserLanguage(principal.userId));
    const skillLevel = progress?.skillLevel ?? 'intermediate';

    const chapter = await ai.generateChapter(
      { exam: exam as ExamSlug, skillLevel, weakSubjects: progress?.weakSubjects ?? [], language },
      parsed.data.topic,
    );

    logger.info('ai.chapter', { userId: principal.userId, topic: parsed.data.topic });
    return c.json({ chapter });
  });

  // ─── POST /mock-test ─────────────────────────────────────────────────────

  app.post('/mock-test', async (c) => {
    const principal = requireAuth(c);
    const body = await c.req.json().catch(() => ({})) as Record<string, unknown>;
    const subject = body['subject'] as string | undefined;
    const topic = body['topic'] as string | undefined;
    const count = Math.min((body['count'] as number) || 10, 30);

    const progress = await progressStore.getProgress(principal.userId);
    const exam = progress?.exam ?? (await getUserExam(principal.userId));
    const language = progress?.language ?? (await getUserLanguage(principal.userId));
    const skillLevel = progress?.skillLevel ?? 'intermediate';

    const ctx = { exam: exam as ExamSlug, skillLevel, weakSubjects: progress?.weakSubjects ?? [], language };
    const mcqs = await ai.generateMcqs(ctx, count, subject || topic);

    logger.info('ai.mock-test', { userId: principal.userId, count: mcqs.length });
    return c.json({
      id: `mock:${principal.userId}:${Date.now()}`,
      mcqs,
      durationMinutes: Math.ceil(count * 2),
      totalQuestions: mcqs.length,
    });
  });

  // ─── POST /final-test ────────────────────────────────────────────────────

  app.post('/final-test', async (c) => {
    const principal = requireAuth(c);
    const body = await c.req.json().catch(() => ({})) as Record<string, unknown>;
    const count = Math.min((body['count'] as number) || 50, 100);

    const progress = await progressStore.getProgress(principal.userId);
    const exam = progress?.exam ?? (await getUserExam(principal.userId));
    const language = progress?.language ?? (await getUserLanguage(principal.userId));
    const skillLevel = progress?.skillLevel ?? 'intermediate';

    const subjects = progress?.syllabus?.map((s) => s.subject) ?? [];
    const ctx = { exam: exam as ExamSlug, skillLevel, weakSubjects: progress?.weakSubjects ?? [], language };
    const mcqs = await ai.generateMcqs(ctx, count, subjects.length > 0 ? subjects.join(', ') : undefined);

    logger.info('ai.final-test', { userId: principal.userId, count: mcqs.length });
    return c.json({
      id: `final:${principal.userId}:${Date.now()}`,
      mcqs,
      durationMinutes: Math.ceil(count * 1.5),
      totalQuestions: mcqs.length,
    });
  });

  // ─── GET /current-affairs ────────────────────────────────────────────────

  app.get('/current-affairs', async (c) => {
    const principal = requireAuth(c);
    const language = await getUserLanguage(principal.userId);
    const exam = await getUserExam(principal.userId);
    const lang = language === 'hi' ? 'Hindi' : 'English';

    const prompt = `Generate 8-10 current affairs items relevant to "${exam}" exam preparation in India.
Each item should be a real, recent, important news/event.
Language: ${lang}
Categories to cover: polity, economy, science, international, sports, environment, defence, technology
Return JSON: { "items": [{ "title": "Short headline", "summary": "2-3 sentence exam-focused summary", "category": "polity|economy|science|international|sports|environment|defence|technology", "date": "${new Date().toISOString().slice(0, 10)}", "examRelevance": "Why this matters for the exam" }] }
Generate AT LEAST 8 items covering different categories.`;

    const systemPrompt = `You are an Indian current affairs expert creating daily digest for competitive exam students. Write factual, concise, exam-relevant summaries. Return ONLY valid JSON.`;

    try {
      const openaiKey = deps.openaiApiKey ?? '';
      if (!openaiKey) {
        return c.json({ items: [] });
      }
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${openaiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: prompt },
          ],
          temperature: 0.7,
          response_format: { type: 'json_object' },
        }),
      });

      if (!res.ok) {
        logger.warn('ai.current-affairs.api-error', { status: res.status });
        return c.json({ items: [] });
      }

      const data = (await res.json()) as { choices?: { message: { content: string } }[] };
      const content = data.choices?.[0]?.message.content ?? '{}';
      const parsed = JSON.parse(content) as { items?: Array<{ title: string; summary: string; category: string; date: string; examRelevance: string }> };

      logger.info('ai.current-affairs', { userId: principal.userId, count: parsed.items?.length ?? 0 });
      return c.json({ items: parsed.items ?? [] });
    } catch (err) {
      logger.warn('ai.current-affairs.error', { error: (err as Error).message });
      return c.json({ items: [] });
    }
  });

  // ─── POST /chat ──────────────────────────────────────────────────────────

  app.post('/chat', async (c) => {
    const principal = requireAuth(c);
    const body = await c.req.json().catch(() => null);
    const schema = z.object({
      message: z.string().min(1).max(4000),
    });
    const parsed = schema.safeParse(body);
    if (!parsed.success) throw new HTTPException(400, { message: 'message required' });

    const progress = await progressStore.getProgress(principal.userId);
    const exam = progress?.exam ?? (await getUserExam(principal.userId));
    const language = progress?.language ?? (await getUserLanguage(principal.userId));
    const skillLevel = progress?.skillLevel ?? 'intermediate';

    // Add user message to history
    const userMsg: ChatMessageRecord = {
      role: 'user',
      content: parsed.data.message,
      timestamp: new Date().toISOString(),
    };
    await chatStore.addMessage(principal.userId, userMsg);

    // Get history for context (last 10 messages)
    const history = await chatStore.getHistory(principal.userId);
    const recentHistory = history.slice(-10).map((m) => ({ role: m.role, content: m.content }));

    // Generate response using AI chat
    const ctx = { exam: exam as ExamSlug, skillLevel, weakSubjects: progress?.weakSubjects ?? [], language };
    // Use the chat method from the AI engine by calling OpenAI directly
    const lang = language === 'hi' ? 'Hindi' : 'English';
    const systemPrompt = `You are Nexi — an intelligent AI study assistant for Indian students preparing for ${exam}. Respond in ${lang}. Student's level: ${skillLevel}. Be helpful, encouraging, and use markdown.`;

    // Build messages for context
    const messages = [
      { role: 'system' as const, content: systemPrompt },
      ...recentHistory.map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
    ];

    // Use the AI engine's built-in methods — we just generate MCQs as a chat fallback
    // Actually, let's call OpenAI directly for chat
    let reply = '';
    try {
      const openaiKey = (deps.ai as any).__openaiKey as string ?? '';
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${openaiKey}`,
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages,
          temperature: 0.7,
          max_tokens: 2000,
        }),
      });
      if (res.ok) {
        const data = (await res.json()) as { choices?: { message: { content: string } }[] };
        reply = data.choices?.[0]?.message.content ?? 'I apologize, please try again.';
      } else {
        reply = 'Sorry, I am unable to respond right now. Please try again later.';
      }
    } catch {
      reply = 'Sorry, I am unable to respond right now. Please try again later.';
    }

    // Save assistant message
    const assistantMsg: ChatMessageRecord = {
      role: 'assistant',
      content: reply,
      timestamp: new Date().toISOString(),
    };
    await chatStore.addMessage(principal.userId, assistantMsg);

    logger.info('ai.chat', { userId: principal.userId });
    return c.json({ reply, timestamp: assistantMsg.timestamp });
  });

  // ─── GET /chat/history ───────────────────────────────────────────────────

  app.get('/chat/history', async (c) => {
    const principal = requireAuth(c);
    const history = await chatStore.getHistory(principal.userId);
    return c.json({ messages: history });
  });

  // ─── DELETE /chat/history ────────────────────────────────────────────────

  app.delete('/chat/history', async (c) => {
    const principal = requireAuth(c);
    await chatStore.clearHistory(principal.userId);
    logger.info('ai.chat.clear', { userId: principal.userId });
    return c.json({ ok: true });
  });

  return app;
}
