import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { requireAuth } from '../auth.js';
import type { Logger } from '../logger.js';
import type { UserStore } from '../lib/userStore.js';
import type { AIEngine } from '../lib/aiEngine.js';
import type { ChapterStore, UserContext } from '../lib/chapterStore.js';
import { getSyllabus, getSyllabusWithFallback, type SyllabusFallbackDeps } from '../lib/syllabusStore.js';
import { asISODateTime, asUserId } from '@nexigrate/shared';
import type { Firestore } from 'firebase-admin/firestore';
import type { Env } from '../env.js';
import { InMemoryMCQPoolStore, FirestoreMCQPoolStore, type MCQPoolStore } from '../lib/mcqPoolStore.js';
import type { CreditLedger } from '../lib/creditLedger.js';
import type { PlatformConfigStore } from '../lib/platformConfigStore.js';

export interface StudyRoutesDeps {
  users: UserStore;
  aiEngine: AIEngine;
  chapters: ChapterStore;
  logger: Logger;
  db: Firestore | null;
  env: Env;
  mcqPool?: MCQPoolStore;
  ledger: CreditLedger;
  /** Live earn amounts read from platformConfig (admin-editable). */
  config: PlatformConfigStore;
  /**
   * Auto-resolver (PR-29). Threaded through to syllabusStore so the
   * Search-grounded gemini-pro call self-heals on model deprecations.
   * Optional for tests; production wiring in app.ts always supplies it.
   */
  modelResolver?: import('../lib/aiModelResolver.js').AIModelResolver | null;
}

export function makeStudyRoutes(deps: StudyRoutesDeps): Hono {
  const app = new Hono();
  const mcqPool = deps.mcqPool ?? (deps.db ? new FirestoreMCQPoolStore(deps.db) : new InMemoryMCQPoolStore());

  // GET /v1/study/syllabus/:examSlug — full syllabus tree (3-tier fallback)
  app.get('/syllabus/:examSlug', async (c) => {
    const principal = requireAuth(c);
    const examSlug = c.req.param('examSlug');

    const { EXAM_BY_SLUG } = await import('@nexigrate/shared');
    const examInfo = EXAM_BY_SLUG.get(examSlug as any);
    const examName = examInfo?.name ?? examSlug.replace(/-/g, ' ').replace(/\b\w/g, (ch: string) => ch.toUpperCase());

    const fallbackDeps: SyllabusFallbackDeps = { env: deps.env, db: deps.db, logger: deps.logger, resolver: deps.modelResolver };
    const syllabus = await getSyllabusWithFallback(examSlug, examName, fallbackDeps);

    return c.json({ syllabus });
  });

  // GET /v1/study/:exam/:subject/:chapter — AI-generate chapter content (cached per level)
  app.get('/:exam/:subject/:chapter', async (c) => {
    const principal = requireAuth(c);
    const { exam, subject, chapter } = c.req.param();
    const language = (c.req.query('lang') as 'en' | 'hi') || 'en';

    // Fetch user to get level and build context
    const user = await deps.users.get(principal.userId);
    const userLevel = user?.onboardingLevel ?? 'intermediate';

    // Check cache first (before deducting credits) — cache key now includes level
    let content = await deps.chapters.getChapter(exam, subject, chapter, language, userLevel);
    if (content) {
      return c.json({ chapter: content, userLevel, contentPersonalizedFor: userLevel });
    }

    // Free-plan users pay `read_chapter` credits via the append-only ledger.
    // Idempotency key collapses retries on the same chapter to one charge,
    // and the ledger refuses to over-spend so we get atomic refusal instead
    // of a silent negative balance.
    let creditsDeducted = false;
    if (user) {
      const { shouldDeductCredits } = await import('@nexigrate/shared');
      if (shouldDeductCredits(user.plan, user.planExpiresAt)) {
        const spendResult = await deps.ledger.spend({
          userId: asUserId(principal.userId),
          reason: 'read_chapter',
          amount: await deps.config.getSpendAmounts().then(s => s.read_chapter),
          sourceRef: `${exam}/${subject}/${chapter}`,
          idempotencyKey: `read_chapter:${principal.userId}:${exam}/${subject}/${chapter}:${userLevel}`,
        });
        if (spendResult.kind === 'insufficient') {
          throw new HTTPException(402, { message: 'insufficient_credits' });
        }
        creditsDeducted = spendResult.kind === 'spent';
        if (creditsDeducted) {
          deps.logger.info('study.credits_deducted', {
            userId: principal.userId,
            amount: -spendResult.event.amount,
          });
        }
      }
    }

    // Build full user context for personalization
    const progress = await deps.chapters.getProgress(principal.userId, exam);
    const weakAreas: string[] = [];
    const strongAreas: string[] = [];
    for (const [chKey, score] of Object.entries(progress.chapterScores)) {
      const s = score as number;
      if (s < 60) weakAreas.push(chKey.split('/').pop() ?? chKey);
      else if (s >= 80) strongAreas.push(chKey.split('/').pop() ?? chKey);
    }

    const userContext: UserContext = {
      targetExam: user?.targetExam ?? exam,
      onboardingScore: user?.onboardingScore ?? 0,
      onboardingLevel: userLevel,
      completedChapters: progress.completedChapters.map((ch: string) => ch.split('/').pop() ?? ch),
      weakAreas,
      strongAreas,
    };

    // Generate with AI and cache
    try {
      const markdown = await deps.aiEngine.generateChapterContent(chapter, subject, exam, language, userContext);
      // Lock §3.8: ~$0.05 per chapter (GPT-4o gen + Gemini Flash verify).
      await deps.aiEngine.recordAICost(principal.userId, 0.05);
      content = {
        exam: exam as any,
        subject,
        chapter,
        language,
        content: markdown,
        generatedAt: asISODateTime(new Date().toISOString()),
        generatedBy: 'gpt-4o',
        userLevel,
        contentPersonalizedFor: userLevel,
      };
      await deps.chapters.saveChapter(content);
      deps.logger.info('study.chapter_generated', { exam, subject, chapter, language, userId: principal.userId, level: userLevel });
    } catch (err) {
      // AI failed after we deducted credits -- award them back as an
      // admin_grant so the ledger stays balanced (we don't reverse the
      // original spend, we just credit the same amount with a unique
      // idempotency key tied to this attempt).
      if (creditsDeducted && user) {
        try {
          const refundAmount = await deps.config.getSpendAmounts().then(s => s.read_chapter);
          await deps.ledger.award({
            userId: asUserId(principal.userId),
            source: 'admin_grant',
            amount: refundAmount,
            sourceRef: `refund:${exam}/${subject}/${chapter}`,
            idempotencyKey: `refund:read_chapter:${principal.userId}:${exam}/${subject}/${chapter}:${Date.now()}`,
          });
          deps.logger.info('study.credits_refunded', { userId: principal.userId, amount: refundAmount, reason: 'ai_failure' });
        } catch (refundErr) {
          deps.logger.error('study.credits_refund_failed', {
            userId: principal.userId,
            error: refundErr instanceof Error ? refundErr.message : String(refundErr),
          });
        }
      }
      throw err;
    }

    return c.json({ chapter: content, userLevel, contentPersonalizedFor: userLevel });
  });

  // GET /v1/study/:exam/:subject/:chapter/quiz — unique MCQs from pool (never repeats)
  app.get('/:exam/:subject/:chapter/quiz', async (c) => {
    const principal = requireAuth(c);
    const { exam, subject, chapter } = c.req.param();
    const language = (c.req.query('lang') as 'en' | 'hi') || 'en';
    try {
      // Get user level for difficulty calibration
      const user = await deps.users.get(principal.userId);
      const userLevel = user?.onboardingLevel ?? 'intermediate';

      // Fetch cached chapter content to ensure quiz is based on what student read
      const cachedContent = await deps.chapters.getChapter(exam, subject, chapter, language, userLevel);
      const chapterText = cachedContent?.content ?? undefined;

      const questions = await mcqPool.getChapterQuiz(
        exam, subject, chapter, principal.userId, language, 10, deps.aiEngine, deps.logger, chapterText, userLevel,
      );
      return c.json({ questions, userLevel });
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      deps.logger.error('study.quiz_error', { exam, subject, chapter, language, error: errorMsg, stack: err instanceof Error ? err.stack?.slice(0, 500) : '' });
      // Return 200 with empty questions + error message instead of 503.
      // Cloudflare proxy strips CORS headers from 503 responses which causes
      // the browser to show "Failed to fetch" instead of the real error.
      // Returning 200 ensures CORS headers pass through and the frontend
      // can display the actual error message to the user.
      return c.json({ questions: [], error: `Quiz generation failed: ${errorMsg.slice(0, 200)}. Try again in a few seconds.`, userLevel: 'intermediate' });
    }
  });

  // GET /v1/study/:exam/:subject/:chapter/diagram — mermaid diagram (full chapter)
  app.get('/:exam/:subject/:chapter/diagram', async (c) => {
    requireAuth(c);
    const { exam, subject, chapter } = c.req.param();
    const mermaid = await deps.aiEngine.generateMermaidDiagram(chapter, subject, exam);
    return c.json({ mermaid });
  });

  // POST /v1/study/visualize — enhanced visualization (supports type: diagram/mindmap/flowchart/timeline/image + selection)
  app.post('/visualize', async (c) => {
    requireAuth(c);
    const body = await c.req.json().catch(() => null) as {
      text?: string; subject?: string; language?: 'en' | 'hi';
      chapterSlug?: string; subjectSlug?: string; examSlug?: string;
      type?: 'diagram' | 'mindmap' | 'flowchart' | 'timeline' | 'image';
    } | null;

    // If type is specified with chapter context, use generateVisualization
    if (body?.type && body.chapterSlug && body.subjectSlug && body.examSlug) {
      const topic = body.chapterSlug.replace(/-/g, ' ');
      try {
        const result = await deps.aiEngine.generateVisualization(topic, body.subjectSlug, body.examSlug, body.type);

        // Cache mermaid visualizations in Firestore
        if (result.type === 'mermaid' && deps.db) {
          const cacheKey = `${body.examSlug}_${body.subjectSlug}_${body.chapterSlug}_${body.type}`;
        try {
          await deps.db.collection('visualizationCache').doc(cacheKey).set({
            ...result,
            topic,
            examSlug: body.examSlug,
            subjectSlug: body.subjectSlug,
            chapterSlug: body.chapterSlug,
            vizType: body.type,
            cachedAt: new Date().toISOString(),
          }, { merge: true });
        } catch { /* cache failure is non-critical */ }
      }

      return c.json({ visualization: result });
      } catch (err) {
        deps.logger.error('study.visualize_error', { type: body.type, chapter: body.chapterSlug, error: err instanceof Error ? err.message : String(err) });
        throw new HTTPException(503, { message: err instanceof Error ? err.message : 'Visualization generation failed. Please try again.' });
      }
    }

    // Legacy: selection-based visualization (text required)
    if (!body?.text) throw new HTTPException(400, { message: 'text or (chapterSlug + subjectSlug + examSlug + type) required' });
    const mermaid = await deps.aiEngine.generateSelectionDiagram(body.text, body.subject ?? 'general', body.language ?? 'en');
    return c.json({ mermaid });
  });

  // POST /v1/study/:exam/:subject/:chapter/complete — mark chapter complete, save score
  app.post('/:exam/:subject/:chapter/complete', async (c) => {
    const principal = requireAuth(c);
    const { exam, subject, chapter } = c.req.param();
    const body = await c.req.json().catch(() => null) as { score?: number } | null;
    const score = Math.max(0, Math.min(100, Math.round(body?.score ?? 0)));

    const progress = await deps.chapters.saveProgress(principal.userId, exam, subject, chapter, score);

    // Award credits via the append-only ledger.
    //
    // Two distinct earn sources, both idempotent on `(userId, exam/subject/chapter)`:
    //   1. chapter_complete -- granted once per chapter regardless of score,
    //      so genuine engagement is rewarded even when the quiz is hard.
    //   2. mcq_pass         -- additionally granted when score >= 70%, the
    //      founder-locked passing threshold for credit awards.
    //
    // Amounts are read from platformConfig (admin-editable); the locked PR-03
    // defaults stay as the fallback if no override is configured. Replays of
    // the same /complete call (browser refresh, double-click) return
    // kind: 'duplicate' from the ledger and award nothing, which closes the
    // pre-PR-03 exploit where users farmed credits by reposting completion.
    const refKey = `${exam}/${subject}/${chapter}`;
    let creditsAwarded = 0;

    const completeResult = await deps.ledger.award({
      userId: asUserId(principal.userId),
      source: 'chapter_complete',
      amount: await deps.config.getEarnAmount('chapter_complete'),
      sourceRef: refKey,
      idempotencyKey: `chapter_complete:${principal.userId}:${refKey}`,
    });
    if (completeResult.kind === 'awarded') creditsAwarded += completeResult.event.amount;

    const passed = score >= 70;
    if (passed) {
      const passResult = await deps.ledger.award({
        userId: asUserId(principal.userId),
        source: 'mcq_pass',
        amount: await deps.config.getEarnAmount('mcq_pass'),
        sourceRef: refKey,
        idempotencyKey: `mcq_pass:${principal.userId}:${refKey}`,
      });
      if (passResult.kind === 'awarded') creditsAwarded += passResult.event.amount;
    }

    deps.logger.info('study.credits_awarded', {
      userId: principal.userId,
      exam,
      subject,
      chapter,
      score,
      passed,
      creditsAwarded,
    });

    // Determine next chapter (unlock requires a passing score).
    const syllabus = getSyllabus(exam);
    let nextChapter: string | null = null;
    let unlocked = false;
    if (syllabus && passed) {
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
    return c.json({ progress, nextChapter, unlocked, creditsAwarded, passed });
  });

  // GET /v1/study/progress/:examSlug — progress for current user
  app.get('/progress/:examSlug', async (c) => {
    const principal = requireAuth(c);
    const examSlug = c.req.param('examSlug');
    const progress = await deps.chapters.getProgress(principal.userId, examSlug);
    return c.json({ progress });
  });

  // GET /v1/study/analysis/:examSlug — detailed learning profile analysis
  app.get('/analysis/:examSlug', async (c) => {
    const principal = requireAuth(c);
    const examSlug = c.req.param('examSlug');

    const [progress, syllabus] = await Promise.all([
      deps.chapters.getProgress(principal.userId, examSlug),
      Promise.resolve(getSyllabus(examSlug)),
    ]);

    if (!syllabus) {
      return c.json({ overallPercent: 0, subjectBreakdown: [], weakChapters: [], strongChapters: [] });
    }

    // Calculate total chapters across all subjects
    let totalChapters = 0;
    const subjectBreakdown: { subject: string; subjectName: string; completed: number; total: number; avgScore: number }[] = [];
    const weakChapters: { subject: string; chapter: string; chapterName: string; score: number }[] = [];
    const strongChapters: { subject: string; chapter: string; chapterName: string; score: number }[] = [];

    for (const sub of syllabus.subjects) {
      const subChapters = sub.chapters.length;
      totalChapters += subChapters;

      let subCompleted = 0;
      let subScoreSum = 0;
      let subScoreCount = 0;

      for (const ch of sub.chapters) {
        const key = `${sub.slug}/${ch.slug}`;
        const score = progress.chapterScores[key];
        if (progress.completedChapters.includes(key)) subCompleted++;
        if (score !== undefined) {
          subScoreSum += score;
          subScoreCount++;
          if (score < 60) {
            weakChapters.push({ subject: sub.slug, chapter: ch.slug, chapterName: ch.name, score });
          } else if (score >= 80) {
            strongChapters.push({ subject: sub.slug, chapter: ch.slug, chapterName: ch.name, score });
          }
        }
      }

      subjectBreakdown.push({
        subject: sub.slug,
        subjectName: sub.name,
        completed: subCompleted,
        total: subChapters,
        avgScore: subScoreCount > 0 ? Math.round(subScoreSum / subScoreCount) : 0,
      });
    }

    const overallPercent = totalChapters > 0
      ? Math.round((progress.completedChapters.length / totalChapters) * 100)
      : 0;

    return c.json({ overallPercent, subjectBreakdown, weakChapters, strongChapters });
  });

  // POST /v1/study/generate-chapters — generate advanced chapters for Scholar+ users
  app.post('/generate-chapters', async (c) => {
    const principal = requireAuth(c);
    const body = await c.req.json().catch(() => null) as { examSlug?: string; subjectSlug?: string } | null;
    if (!body?.examSlug || !body?.subjectSlug) throw new HTTPException(400, { message: 'examSlug and subjectSlug required' });

    // Plan check: must be paid plan (scholar or above)
    const user = await deps.users.get(principal.userId);
    if (!user || user.plan === 'free') {
      throw new HTTPException(403, { message: 'Scholar plan required to generate advanced chapters. Upgrade at /upgrade' });
    }

    // Get current syllabus
    const syllabus = getSyllabus(body.examSlug);
    if (!syllabus) throw new HTTPException(404, { message: 'Syllabus not found for this exam' });

    const subjectData = syllabus.subjects.find(s => s.slug === body.subjectSlug);
    if (!subjectData) throw new HTTPException(404, { message: 'Subject not found in syllabus' });

    const existingChapters = subjectData.chapters.map(ch => ch.name).join(', ');
    const nextOrder = subjectData.chapters.length + 1;

    try {
      const prompt = `The student has completed all standard chapters for "${subjectData.name}" in "${syllabus.examName}".
Generate 5 advanced/additional chapter topics that go beyond the standard syllabus but are highly relevant for ${syllabus.examName} preparation.
Existing chapters: ${existingChapters}. Do not repeat any.
Return ONLY valid JSON array: [{"name":"Chapter Name","slug":"chapter-slug","nameHi":"Hindi Name","estimatedMinutes":45,"order":${nextOrder},"isAdvanced":true}]`;

      let newChapters: { name: string; slug: string; nameHi: string; estimatedMinutes: number; order: number; isAdvanced: boolean }[] = [];

      // Use GPT-4o for deep generation
      if (deps.env.OPENAI_API_KEY && deps.env.OPENAI_API_KEY.length > 5) {
        const OpenAI = (await import('openai')).default;
        const openai = new OpenAI({ apiKey: deps.env.OPENAI_API_KEY });
        const completion = await openai.chat.completions.create({
          model: 'gpt-4o',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.7,
          max_tokens: 1500,
          response_format: { type: 'json_object' },
        });
        const raw = completion.choices[0]?.message?.content ?? '[]';
        const parsed = JSON.parse(raw);
        newChapters = Array.isArray(parsed) ? parsed : parsed.chapters ?? [];
      } else {
        throw new Error('OpenAI API key required for chapter generation');
      }

      if (newChapters.length === 0) throw new Error('AI returned no chapters');

      // Assign correct order numbers
      newChapters = newChapters.map((ch, i) => ({
        ...ch,
        order: nextOrder + i,
        isAdvanced: true,
      }));

      // Save to Firestore (append to syllabus)
      if (deps.db) {
        const syllabusRef = deps.db.collection('syllabi').doc(`${body.examSlug}_${body.subjectSlug}`);
        const snap = await syllabusRef.get();
        const existing = snap.exists ? (snap.data()?.chapters ?? []) : subjectData.chapters;
        await syllabusRef.set({
          examSlug: body.examSlug,
          subjectSlug: body.subjectSlug,
          chapters: [...existing, ...newChapters],
          updatedAt: new Date().toISOString(),
        }, { merge: true });
      }

      deps.logger.info('study.chapters_generated', { userId: principal.userId, exam: body.examSlug, subject: body.subjectSlug, count: newChapters.length });
      return c.json({ newChapters, message: `${newChapters.length} new advanced chapters added!` });
    } catch (err) {
      deps.logger.error('study.generate_chapters_error', { error: err instanceof Error ? err.message : String(err) });
      throw new HTTPException(503, { message: 'Failed to generate chapters. Please try again.' });
    }
  });

  return app;
}
