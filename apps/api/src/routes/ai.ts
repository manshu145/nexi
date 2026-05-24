/**
 * AI Routes — all AI-powered endpoints.
 *
 * /v1/ai/syllabus       — Generate exam syllabus
 * /v1/ai/assess         — Generate + grade assessment MCQs
 * /v1/ai/chapter        — Generate chapter for a topic
 * /v1/ai/mock-test      — Generate mock test for a topic
 * /v1/ai/final-test     — Generate final comprehensive test
 * /v1/ai/current-affairs — Get current affairs digest
 * /v1/ai/chat           — Chat with Nexi AI
 * /v1/ai/progress       — Get/update student progress
 */

import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import type { UserId } from '@nexigrate/shared';
import { requireAuth } from '../auth.js';
import type { AIEngine } from '../lib/aiEngine.js';
import type { ChapterStore, StudentProgress } from '../lib/chapterStore.js';
import type { UserStore } from '../lib/userStore.js';
import type { Logger } from '../logger.js';

export interface AIRoutesDeps {
  ai: AIEngine;
  chapters: ChapterStore;
  users: UserStore;
  logger: Logger;
}

export function makeAIRoutes(deps: AIRoutesDeps): Hono {
  const app = new Hono();

  // Generate syllabus for exam
  app.post('/syllabus', async (c) => {
    const principal = requireAuth(c);
    const body = await c.req.json().catch(() => null);
    const schema = z.object({
      exam: z.string().min(1),
      language: z.enum(['en', 'hi']).default('en'),
    });
    const parsed = schema.safeParse(body);
    if (!parsed.success) throw new HTTPException(400, { message: 'exam required' });

    const syllabus = await deps.ai.generateSyllabus(parsed.data.exam, parsed.data.language);
    deps.logger.info('ai.syllabus', { userId: principal.userId, exam: parsed.data.exam });
    return c.json({ syllabus });
  });

  // Generate assessment MCQs
  app.post('/assess/generate', async (c) => {
    const principal = requireAuth(c);
    const body = await c.req.json().catch(() => null);
    const schema = z.object({
      exam: z.string().min(1),
      count: z.number().min(5).max(25).default(15),
      language: z.enum(['en', 'hi']).default('en'),
    });
    const parsed = schema.safeParse(body);
    if (!parsed.success) throw new HTTPException(400, { message: 'invalid request' });

    const mcqs = await deps.ai.generateAssessmentMcqs(
      parsed.data.exam,
      parsed.data.count,
      parsed.data.language,
    );
    deps.logger.info('ai.assess.generate', { userId: principal.userId, count: mcqs.length });
    return c.json({ mcqs });
  });

  // Submit assessment answers and get result
  app.post('/assess/submit', async (c) => {
    const principal = requireAuth(c);
    const body = await c.req.json().catch(() => null);
    const schema = z.object({
      mcqs: z.array(z.any()),
      answers: z.array(z.string().nullable()),
      exam: z.string().min(1),
      language: z.enum(['en', 'hi']).default('en'),
    });
    const parsed = schema.safeParse(body);
    if (!parsed.success) throw new HTTPException(400, { message: 'invalid request' });

    const result = deps.ai.assessStudent(parsed.data.mcqs, parsed.data.answers);

    // Generate syllabus and save progress
    const syllabus = await deps.ai.generateSyllabus(parsed.data.exam, parsed.data.language);

    const progress: StudentProgress = {
      userId: principal.userId,
      exam: parsed.data.exam,
      language: parsed.data.language,
      skillLevel: result.skillLevel,
      weakSubjects: result.weakSubjects,
      strongSubjects: result.strongSubjects,
      syllabus,
      completedTopics: [],
      currentSubject: syllabus[0]?.subject ?? '',
      currentTopicIndex: 0,
      chapterMockScores: {},
      syllabusComplete: false,
      finalTestScore: null,
      assessmentResult: result,
    };

    await deps.chapters.saveProgress(principal.userId as UserId, progress);
    deps.logger.info('ai.assess.submit', { userId: principal.userId, skillLevel: result.skillLevel });
    return c.json({ result, progress });
  });

  // Get student progress
  app.get('/progress', async (c) => {
    const principal = requireAuth(c);
    const progress = await deps.chapters.getProgress(principal.userId as UserId);
    return c.json({ progress });
  });

  // Update progress (mark topic complete, update scores)
  app.post('/progress/update', async (c) => {
    const principal = requireAuth(c);
    const body = await c.req.json().catch(() => null);
    if (!body) throw new HTTPException(400, { message: 'body required' });

    const existing = await deps.chapters.getProgress(principal.userId as UserId);
    if (!existing) throw new HTTPException(404, { message: 'no progress found' });

    const updated = { ...existing, ...body, userId: principal.userId };
    await deps.chapters.saveProgress(principal.userId as UserId, updated);
    return c.json({ progress: updated });
  });

  // Generate chapter
  app.post('/chapter', async (c) => {
    const principal = requireAuth(c);
    const body = await c.req.json().catch(() => null);
    const schema = z.object({
      exam: z.string().min(1),
      subject: z.string().min(1),
      topic: z.string().min(1),
      topicId: z.string().min(1),
      skillLevel: z.enum(['beginner', 'intermediate', 'advanced']).default('intermediate'),
      language: z.enum(['en', 'hi']).default('en'),
    });
    const parsed = schema.safeParse(body);
    if (!parsed.success) throw new HTTPException(400, { message: 'invalid request' });

    // Check if already generated
    const existing = await deps.chapters.getChapter(principal.userId as UserId, parsed.data.topicId);
    if (existing) return c.json({ chapter: existing });

    const chapter = await deps.ai.generateChapter(
      parsed.data.exam,
      parsed.data.subject,
      parsed.data.topic,
      parsed.data.skillLevel,
      parsed.data.language,
    );

    const stored = {
      ...chapter,
      id: parsed.data.topicId,
      exam: parsed.data.exam,
      generatedAt: new Date().toISOString(),
    };

    await deps.chapters.saveChapter(principal.userId as UserId, parsed.data.topicId, stored);
    deps.logger.info('ai.chapter', { userId: principal.userId, topic: parsed.data.topic });
    return c.json({ chapter: stored });
  });

  // Generate mock test for a topic
  app.post('/mock-test', async (c) => {
    const principal = requireAuth(c);
    const body = await c.req.json().catch(() => null);
    const schema = z.object({
      exam: z.string().min(1),
      subject: z.string().min(1),
      topic: z.string().min(1),
      count: z.number().min(5).max(30).default(10),
      skillLevel: z.enum(['beginner', 'intermediate', 'advanced']).default('intermediate'),
      language: z.enum(['en', 'hi']).default('en'),
    });
    const parsed = schema.safeParse(body);
    if (!parsed.success) throw new HTTPException(400, { message: 'invalid request' });

    const mcqs = await deps.ai.generateMockTest(
      parsed.data.exam,
      parsed.data.subject,
      parsed.data.topic,
      parsed.data.count,
      parsed.data.skillLevel,
      parsed.data.language,
    );
    deps.logger.info('ai.mock-test', { userId: principal.userId, topic: parsed.data.topic });
    return c.json({ mcqs });
  });

  // Generate final comprehensive test
  app.post('/final-test', async (c) => {
    const principal = requireAuth(c);
    const body = await c.req.json().catch(() => null);
    const schema = z.object({
      exam: z.string().min(1),
      subjects: z.array(z.string()),
      count: z.number().min(20).max(100).default(50),
      language: z.enum(['en', 'hi']).default('en'),
    });
    const parsed = schema.safeParse(body);
    if (!parsed.success) throw new HTTPException(400, { message: 'invalid request' });

    const mcqs = await deps.ai.generateFinalTest(
      parsed.data.exam,
      parsed.data.subjects,
      parsed.data.count,
      parsed.data.language,
    );
    deps.logger.info('ai.final-test', { userId: principal.userId });
    return c.json({ mcqs });
  });

  // Current affairs
  app.get('/current-affairs', async (c) => {
    const principal = requireAuth(c);
    const language = (c.req.query('language') ?? 'en') as 'en' | 'hi';
    const today = new Date().toISOString().split('T')[0]!;

    // Check cache first
    let items = await deps.chapters.getCurrentAffairs(today, language);
    if (!items) {
      items = await deps.ai.generateCurrentAffairs(language, 8);
      await deps.chapters.saveCurrentAffairs(today, language, items);
    }
    return c.json({ items, date: today });
  });

  // Chat with Nexi AI
  app.post('/chat', async (c) => {
    const principal = requireAuth(c);
    const body = await c.req.json().catch(() => null);
    const schema = z.object({
      message: z.string().min(1).max(5000),
    });
    const parsed = schema.safeParse(body);
    if (!parsed.success) throw new HTTPException(400, { message: 'message required' });

    // Get existing chat history
    const history = await deps.chapters.getChatHistory(principal.userId as UserId);
    
    // Get student context
    const progress = await deps.chapters.getProgress(principal.userId as UserId);
    const studentContext = {
      exam: progress?.exam ?? 'general',
      skillLevel: progress?.skillLevel ?? 'intermediate',
      language: (progress?.language ?? 'en') as 'en' | 'hi',
    };

    // Add user message to history
    const updatedHistory = [...history, { role: 'user' as const, content: parsed.data.message }];

    // Get AI response (send last 20 messages for context)
    const contextMessages = updatedHistory.slice(-20);
    const reply = await deps.ai.chat(contextMessages, studentContext);

    // Save updated history with assistant response
    const finalHistory = [...updatedHistory, { role: 'assistant' as const, content: reply }];
    await deps.chapters.saveChatHistory(principal.userId as UserId, finalHistory);

    deps.logger.info('ai.chat', { userId: principal.userId });
    return c.json({ reply, historyLength: finalHistory.length });
  });

  // Get chat history
  app.get('/chat/history', async (c) => {
    const principal = requireAuth(c);
    const history = await deps.chapters.getChatHistory(principal.userId as UserId);
    return c.json({ messages: history });
  });

  // Clear chat history
  app.delete('/chat/history', async (c) => {
    const principal = requireAuth(c);
    await deps.chapters.saveChatHistory(principal.userId as UserId, []);
    return c.json({ ok: true });
  });

  return app;
}
