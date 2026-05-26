import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { requireAuth } from '../auth.js';
import type { Logger } from '../logger.js';
import type { UserStore } from '../lib/userStore.js';
import type { AIEngine } from '../lib/aiEngine.js';
import type { ChapterStore } from '../lib/chapterStore.js';
import { getSyllabus, getSyllabusWithFallback, type SyllabusFallbackDeps } from '../lib/syllabusStore.js';
import { asISODateTime } from '@nexigrate/shared';
import type { Firestore } from 'firebase-admin/firestore';
import type { Env } from '../env.js';

export interface StudyRoutesDeps {
  users: UserStore;
  aiEngine: AIEngine;
  chapters: ChapterStore;
  logger: Logger;
  db: Firestore | null;
  env: Env;
}

export function makeStudyRoutes(deps: StudyRoutesDeps): Hono {
  const app = new Hono();

  // GET /v1/study/syllabus/:examSlug — full syllabus tree (3-tier fallback)
  app.get('/syllabus/:examSlug', async (c) => {
    const principal = requireAuth(c);
    const examSlug = c.req.param('examSlug');

    const { EXAM_BY_SLUG } = await import('@nexigrate/shared');
    const examInfo = EXAM_BY_SLUG.get(examSlug as any);
    const examName = examInfo?.name ?? examSlug.replace(/-/g, ' ').replace(/\b\w/g, (ch: string) => ch.toUpperCase());

    const fallbackDeps: SyllabusFallbackDeps = { env: deps.env, db: deps.db, logger: deps.logger };
    const syllabus = await getSyllabusWithFallback(examSlug, examName, fallbackDeps);

    return c.json({ syllabus });
  });

  // GET /v1/study/:exam/:subject/:chapter — AI-generate chapter content (cached)
  app.get('/:exam/:subject/:chapter', async (c) => {
    const principal = requireAuth(c);
    const { exam, subject, chapter } = c.req.param();
    const language = (c.req.query('lang') as 'en' | 'hi') || 'en';

    // Check cache first
    let content = await deps.chapters.getChapter(exam, subject, chapter, language);
    if (!content) {
      // Generate with AI and cache
      const markdown = await deps.aiEngine.generateChapterContent(chapter, subject, exam, language);
      content = {
        exam: exam as any,
        subject,
        chapter,
        language,
        content: markdown,
        generatedAt: asISODateTime(new Date().toISOString()),
        generatedBy: 'gpt-4o',
      };
      await deps.chapters.saveChapter(content);
      deps.logger.info('study.chapter_generated', { exam, subject, chapter, language, userId: principal.userId });
    }

    return c.json({ chapter: content });
  });

  // GET /v1/study/:exam/:subject/:chapter/quiz — 10 MCQs for chapter
  app.get('/:exam/:subject/:chapter/quiz', async (c) => {
    requireAuth(c);
    const { exam, subject, chapter } = c.req.param();
    const language = (c.req.query('lang') as 'en' | 'hi') || 'en';
    try {
      const questions = await deps.aiEngine.generateChapterMCQs(chapter, subject, exam, language, 10);
      return c.json({ questions });
    } catch (err) {
      deps.logger.error('study.quiz_error', { exam, subject, chapter, language, error: err instanceof Error ? err.message : String(err) });
      throw new HTTPException(503, { message: 'Quiz generation failed. AI service may be unavailable. Please try again.' });
    }
  });

  // GET /v1/study/:exam/:subject/:chapter/diagram — mermaid diagram (full chapter)
  app.get('/:exam/:subject/:chapter/diagram', async (c) => {
    requireAuth(c);
    const { exam, subject, chapter } = c.req.param();
    const mermaid = await deps.aiEngine.generateMermaidDiagram(chapter, subject, exam);
    return c.json({ mermaid });
  });

  // POST /v1/study/visualize — selection-based visualization
  app.post('/visualize', async (c) => {
    requireAuth(c);
    const body = await c.req.json().catch(() => null) as { text?: string; subject?: string; language?: 'en' | 'hi' } | null;
    if (!body?.text) throw new HTTPException(400, { message: 'text is required' });
    const mermaid = await deps.aiEngine.generateSelectionDiagram(body.text, body.subject ?? 'general', body.language ?? 'en');
    return c.json({ mermaid });
  });

  // POST /v1/study/:exam/:subject/:chapter/complete — mark chapter complete, save score
  app.post('/:exam/:subject/:chapter/complete', async (c) => {
    const principal = requireAuth(c);
    const { exam, subject, chapter } = c.req.param();
    const body = await c.req.json().catch(() => null) as { score?: number } | null;
    const score = body?.score ?? 0;

    const progress = await deps.chapters.saveProgress(principal.userId, exam, subject, chapter, score);

    // Award credits: +5 for any attempt, +5 bonus for passing (>=80%)
    let creditsAwarded = 5;
    if (score >= 80) creditsAwarded = 10;
    await deps.users.update(principal.userId, {} as any); // touch updatedAt

    // Determine next chapter
    const syllabus = getSyllabus(exam);
    let nextChapter: string | null = null;
    let unlocked = false;
    if (syllabus && score >= 80) {
      const subjectData = syllabus.subjects.find(s => s.slug === subject);
      if (subjectData) {
        const currentIdx = subjectData.chapters.findIndex(ch => ch.slug === chapter);
        if (currentIdx >= 0 && currentIdx < subjectData.chapters.length - 1) {
          nextChapter = subjectData.chapters[currentIdx + 1]!.slug;
          unlocked = true;
        }
      }
    }

    deps.logger.info('study.chapter_completed', { userId: principal.userId, exam, subject, chapter, score, unlocked });
    return c.json({ progress, nextChapter, unlocked, creditsAwarded, passed: score >= 80 });
  });

  // GET /v1/study/progress/:examSlug — progress for current user
  app.get('/progress/:examSlug', async (c) => {
    const principal = requireAuth(c);
    const examSlug = c.req.param('examSlug');
    const progress = await deps.chapters.getProgress(principal.userId, examSlug);
    return c.json({ progress });
  });

  return app;
}
