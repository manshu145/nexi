import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { requireAuth } from '../auth.js';
import type { Logger } from '../logger.js';
import type { UserStore } from '../lib/userStore.js';
import type { AIEngine, GeneratedMCQ } from '../lib/aiEngine.js';
import type { ChapterStore, UserContext } from '../lib/chapterStore.js';
import { getSyllabusWithFallback, type SyllabusFallbackDeps } from '../lib/syllabusStore.js';
import { effectiveLevel, nextLevel, isPromotion } from '../lib/levelProgression.js';
import { triggerBackgroundRefresh } from '../lib/contentRefresh.js';
import { asISODateTime, asUserId, EXAM_BY_SLUG, type SyllabusTree } from '@nexigrate/shared';
import type { Firestore } from 'firebase-admin/firestore';
import type { Env } from '../env.js';
import { InMemoryMCQPoolStore, FirestoreMCQPoolStore, type MCQPoolStore } from '../lib/mcqPoolStore.js';
import type { CreditLedger } from '../lib/creditLedger.js';
import type { PlatformConfigStore } from '../lib/platformConfigStore.js';
import type { FeatureUsageStore } from '../lib/featureUsageStore.js';
import { PlanGate, FeatureKey } from '../lib/planGate.js';

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
  /** Spaced-repetition store — schedules a chapter for review on completion. Optional for tests. */
  review?: import('../lib/reviewStore.js').ReviewStore | null;
  /** Per-user usage counter for the daily-MCQ cap + paid chapter fair-use cap. Optional for tests. */
  usage?: FeatureUsageStore;
}

/** Human-readable exam name from the curated registry, with a slug-derived fallback. */
function resolveExamName(examSlug: string): string {
  const info = EXAM_BY_SLUG.get(examSlug as Parameters<typeof EXAM_BY_SLUG.get>[0]);
  return info?.name ?? examSlug.replace(/-/g, ' ').replace(/\b\w/g, (ch) => ch.toUpperCase());
}

/**
 * Short-lived cache of a generated practice quiz, keyed by the client's
 * self-generated `attemptId`. Lets a retry after a dropped response replay the
 * SAME quiz without re-charging the daily cap or pulling fresh pool questions.
 * Best-effort: any Firestore hiccup falls through to a normal (charged) gen.
 */
const QUIZ_ATTEMPT_TTL_MS = 2 * 60 * 60 * 1000; // 2h, matches the client sessionStorage TTL

function quizAttemptRef(db: Firestore, userId: string, attemptId: string) {
  const safe = attemptId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64);
  return db.collection('quizAttempts').doc(`${userId}_${safe}`);
}

async function readCachedQuizAttempt(
  db: Firestore,
  userId: string,
  attemptId: string,
): Promise<{ questions: GeneratedMCQ[]; userLevel?: 'beginner' | 'intermediate' | 'advanced' } | null> {
  try {
    const snap = await quizAttemptRef(db, userId, attemptId).get();
    if (!snap.exists) return null;
    const data = snap.data() as { questions?: GeneratedMCQ[]; userLevel?: 'beginner' | 'intermediate' | 'advanced'; ts?: number } | undefined;
    if (!data?.questions?.length) return null;
    if (typeof data.ts === 'number' && Date.now() - data.ts > QUIZ_ATTEMPT_TTL_MS) return null; // expired
    return { questions: data.questions, userLevel: data.userLevel };
  } catch {
    return null; // fail-open: a cache miss just means a normal generation
  }
}

async function writeCachedQuizAttempt(
  db: Firestore,
  userId: string,
  attemptId: string,
  questions: GeneratedMCQ[],
  userLevel: 'beginner' | 'intermediate' | 'advanced',
): Promise<void> {
  await quizAttemptRef(db, userId, attemptId).set({
    questions, userLevel, ts: Date.now(), createdAt: new Date().toISOString(),
  });
}

/**
 * Merge AI-appended chapters (stored at `syllabi/{examSlug}_{subjectSlug}`
 * by POST /generate-chapters) into a syllabus tree so that "Generate More
 * Chapters" results actually show up on reload. Existing chapters win on
 * slug collision; new ones are appended and the list is re-sorted by order.
 * Fail-soft: any Firestore error leaves the subject untouched.
 *
 * Performance (S6 fix): uses db.getAll() to batch-read all subject docs
 * in a single Firestore round-trip instead of N sequential reads.
 */
async function mergeAppendedChapters(
  db: Firestore | null,
  examSlug: string,
  syllabus: SyllabusTree,
): Promise<SyllabusTree> {
  if (!db) return syllabus;
  if (syllabus.subjects.length === 0) return syllabus;

  try {
    // Batch read: single network call for all subject docs
    const refs = syllabus.subjects.map((sub) =>
      db.collection('syllabi').doc(`${examSlug}_${sub.slug}`)
    );
    const snaps = await db.getAll(...refs);

    const subjects = syllabus.subjects.map((sub, i) => {
      const snap = snaps[i];
      if (!snap || !snap.exists) return sub;
      const stored = (snap.data()?.chapters ?? []) as {
        slug?: string; name?: string; nameHi?: string; order?: number; estimatedMinutes?: number;
      }[];
      if (!Array.isArray(stored) || stored.length === 0) return sub;
      const bySlug = new Map(sub.chapters.map((ch) => [ch.slug, ch]));
      let nextOrder = sub.chapters.length;
      for (const ch of stored) {
        if (!ch?.slug || bySlug.has(ch.slug)) continue;
        bySlug.set(ch.slug, {
          slug: ch.slug,
          name: ch.name ?? ch.slug,
          nameHi: ch.nameHi ?? ch.name ?? ch.slug,
          order: ch.order ?? ++nextOrder,
          estimatedMinutes: ch.estimatedMinutes ?? 40,
        });
      }
      const merged = Array.from(bySlug.values()).sort((a, b) => a.order - b.order);
      return { ...sub, chapters: merged };
    });

    return { ...syllabus, subjects };
  } catch {
    // Fail-soft: return original syllabus if batch read fails
    return syllabus;
  }
}

export function makeStudyRoutes(deps: StudyRoutesDeps): Hono {
  const app = new Hono();
  const mcqPool = deps.mcqPool ?? (deps.db ? new FirestoreMCQPoolStore(deps.db) : new InMemoryMCQPoolStore());
  // Central plan/feature gate — only when the usage counter is wired
  // (production always wires it; some tests don't). Fail-open otherwise.
  const planGate = deps.usage ? new PlanGate({ config: deps.config, usage: deps.usage, ledger: deps.ledger, logger: deps.logger }) : null;

  // GET /v1/study/syllabus/:examSlug — full syllabus tree (3-tier fallback)
  app.get('/syllabus/:examSlug', async (c) => {
    const principal = requireAuth(c);
    const examSlug = c.req.param('examSlug');

    const examName = resolveExamName(examSlug);

    const fallbackDeps: SyllabusFallbackDeps = { env: deps.env, db: deps.db, logger: deps.logger, resolver: deps.modelResolver, aiEngine: deps.aiEngine };
    const baseSyllabus = await getSyllabusWithFallback(examSlug, examName, fallbackDeps);
    // Merge any AI-appended chapters (from "Generate More Chapters") so they
    // actually appear on reload.
    const syllabus = await mergeAppendedChapters(deps.db, examSlug, baseSyllabus);

    return c.json({ syllabus });
  });

  // GET /v1/study/:exam/:subject/:chapter — AI-generate chapter content (cached per level)
  app.get('/:exam/:subject/:chapter', async (c) => {
    const principal = requireAuth(c);
    const { exam, subject, chapter } = c.req.param();
    const language = (c.req.query('lang') as 'en' | 'hi') || 'en';

    // Fetch user to get level and build context
    const user = await deps.users.get(principal.userId);
    const userLevel = effectiveLevel(user);

    // Check cache first (before deducting credits) — cache key now includes level
    let content = await deps.chapters.getChapter(exam, subject, chapter, language, userLevel);
    if (content) {
      // Weekly freshness: if cached content is stale, serve it instantly but
      // regenerate in the background so the next reader gets updated content.
      // No credit charge, no user wait. (Stale-while-revalidate.)
      triggerBackgroundRefresh(
        { aiEngine: deps.aiEngine, chapters: deps.chapters, logger: deps.logger },
        content,
        deps.env.CONTENT_REFRESH_DAYS,
      );
      return c.json({ chapter: content, userLevel, contentPersonalizedFor: userLevel });
    }

    // Cache miss — this is a NEW chapter generation. Gate it:
    //  • Active paid users → daily chapter fair-use cap (chaptersPerDay).
    //  • Free / expired users → pay `read_chapter` credits (below).
    // Re-reads of already-cached chapters are free for everyone (handled by
    // the cache-hit early return above).
    let chapterCommit: () => Promise<void> = async () => {};
    if (planGate) {
      const gate = await planGate.enforcePaidCap(user, FeatureKey.CHAPTER_ACCESS, language);
      if (!gate.ok) return c.json(gate.body, gate.status);
      chapterCommit = gate.commit;
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
      // Count this new chapter against the paid daily cap (no-op for free/
      // expired users, who were metered by credits above).
      await chapterCommit();
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
            idempotencyKey: `refund:read_chapter:${principal.userId}:${exam}/${subject}/${chapter}:${userLevel}`,
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

    // CORS headers set MANUALLY — bypasses Cloudflare stripping on error responses
    const origin = c.req.header('origin') || 'https://app.nexigrate.com';
    if (['https://app.nexigrate.com', 'https://nexigrate.com', 'http://localhost:3000'].includes(origin)) {
      c.header('Access-Control-Allow-Origin', origin);
      c.header('Access-Control-Allow-Credentials', 'true');
    }

    try {
      // Get user level for difficulty calibration
      const user = await deps.users.get(principal.userId);
      const userLevel = effectiveLevel(user);

      // ── Idempotent replay (network-resilience fix) ───────────────────────
      // The client sends a stable, self-generated `attemptId`. If we already
      // generated a quiz for this attemptId, return it WITHOUT re-charging the
      // daily cap or pulling fresh pool questions. This fixes the founder bug:
      // on a flaky 5G connection the server would generate + charge the cap,
      // then the response would drop in transit — so the student saw a
      // "network error" yet their daily practice set was consumed, and a retry
      // hit the upgrade wall. Now a retry with the same attemptId just replays
      // the already-paid-for quiz.
      const attemptId = c.req.query('attemptId');
      if (attemptId && deps.db) {
        const cached = await readCachedQuizAttempt(deps.db, principal.userId, attemptId);
        if (cached && cached.questions.length > 0) {
          deps.logger.info('study.quiz_replayed', { userId: principal.userId, attemptId, count: cached.questions.length });
          return c.json({ questions: cached.questions, userLevel: cached.userLevel ?? userLevel, replayed: true });
        }
      }

      // Daily practice-set cap (admin-editable `dailyMCQ`; -1 = unlimited).
      // The cap counts PRACTICE SETS (quizzes), NOT individual questions: one
      // quiz serves up to 10 MCQs and consumes exactly ONE unit against the
      // daily allowance. (Previously each quiz charged 10, so a Starter plan
      // configured for "10" was exhausted by a SINGLE quiz — the founder bug
      // where paid users hit "Daily practice limit (10)" after one set.)
      // Free users hit the cap → structured upgrade prompt. Fail-open if the
      // gate isn't wired.
      let mcqCommit: () => Promise<void> = async () => {};
      if (planGate) {
        const gate = await planGate.enforce(user, FeatureKey.DAILY_MCQ, language, { cost: 1 });
        if (!gate.ok) return c.json(gate.body, gate.status);
        mcqCommit = gate.commit;
      }

      // Fetch cached chapter content to ensure quiz is based on what student read
      const cachedContent = await deps.chapters.getChapter(exam, subject, chapter, language, userLevel);
      const chapterText = cachedContent?.content ?? undefined;

      const questions = await mcqPool.getChapterQuiz(
        exam, subject, chapter, principal.userId, language, 10, deps.aiEngine, deps.logger, chapterText, userLevel,
      );
      // Count this practice set (one unit) against the daily cap (only on success).
      await mcqCommit();
      // Persist for idempotent retries BEFORE responding, so even if this
      // response is lost on a flaky network the next retry replays it for free.
      if (attemptId && deps.db) {
        await writeCachedQuizAttempt(deps.db, principal.userId, attemptId, questions, userLevel).catch(() => { /* best-effort */ });
      }
      return c.json({ questions, userLevel });
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      deps.logger.error('study.quiz_error', { exam, subject, chapter, language, error: errorMsg });
      return c.json({ questions: [], error: `Quiz generation failed: ${errorMsg.slice(0, 200)}. Try again.`, userLevel: 'intermediate' });
    }
  });

  // GET /v1/study/:exam/:subject/:chapter/flashcards — AI revision flashcards (cached)
  app.get('/:exam/:subject/:chapter/flashcards', async (c) => {
    const principal = requireAuth(c);
    const { exam, subject, chapter } = c.req.param();
    const language = (c.req.query('lang') as 'en' | 'hi') || 'en';

    try {
      // Flashcards are concise facts — shared across levels to keep cost low.
      const cacheKey = `${exam}_${subject}_${chapter}_${language}`;
      if (deps.db) {
        const snap = await deps.db.collection('flashcardsCache').doc(cacheKey).get();
        if (snap.exists) {
          const data = snap.data() as { cards?: Array<{ front: string; back: string }> };
          if (data?.cards?.length) return c.json({ cards: data.cards, cached: true });
        }
      }

      // Base cards on the chapter the student actually read (any cached level).
      const user = await deps.users.get(principal.userId);
      const userLevel = effectiveLevel(user);
      const cachedContent = await deps.chapters.getChapter(exam, subject, chapter, language, userLevel);
      const chapterText = cachedContent?.content ?? undefined;

      const cards = await deps.aiEngine.generateFlashcards(chapter, subject, exam, language, 12, chapterText);

      if (deps.db && cards.length) {
        await deps.db.collection('flashcardsCache').doc(cacheKey).set({
          exam, subject, chapter, language, cards, generatedAt: new Date().toISOString(),
        }).catch(() => { /* cache write best-effort */ });
      }
      return c.json({ cards, cached: false });
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      deps.logger.error('study.flashcards_error', { exam, subject, chapter, language, error: errorMsg });
      return c.json({ cards: [], error: `Could not generate flashcards: ${errorMsg.slice(0, 160)}. Try again.` });
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
    const body = await c.req.json().catch(() => null) as {
      score?: number;
      answers?: Array<{ questionId: string; chosen: string | null }>;
      lang?: 'en' | 'hi';
    } | null;

    // Default: clamp the client-reported score. Kept for legacy clients
    // and as a safe fallback when server-side re-scoring can't resolve the
    // pool (so a Firestore/pool miss never wrongly zeroes a real student).
    let score = Math.max(0, Math.min(100, Math.round(body?.score ?? 0)));

    // SERVER-AUTHORITATIVE SCORING (anti-cheat). When the client sends the
    // per-question answers, recompute the score from the stored MCQ pool's
    // correctOption. This closes the exploit where a client could POST an
    // arbitrary `score` (e.g. 100) to farm the mcq_pass credit and unlock
    // the next chapter without actually passing. We only override the score
    // when we can resolve at least one question from the pool; otherwise we
    // keep the client value (fallback) so the happy path never regresses.
    const answers = body?.answers;
    if (Array.isArray(answers) && answers.length > 0) {
      const lang: 'en' | 'hi' = body?.lang === 'hi' ? 'hi' : 'en';
      try {
        const correctMap = await mcqPool.lookupCorrectOptions(
          exam, subject, chapter, lang, answers.map((a) => a.questionId),
        );
        if (correctMap.size > 0) {
          let correct = 0;
          for (const a of answers) {
            const co = correctMap.get(a.questionId);
            if (co && a.chosen === co) correct++;
          }
          score = Math.round((correct / answers.length) * 100);
          deps.logger.info('study.quiz_server_scored', {
            userId: principal.userId, exam, subject, chapter,
            total: answers.length, resolved: correctMap.size, score,
          });
        } else {
          deps.logger.warn('study.quiz_server_score_fallback', {
            userId: principal.userId, exam, subject, chapter, reason: 'no_pool_match',
          });
        }
      } catch (err) {
        deps.logger.warn('study.quiz_server_score_error', {
          userId: principal.userId, exam, subject, chapter,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    const progress = await deps.chapters.saveProgress(principal.userId, exam, subject, chapter, score);

    // ── Level progression (PR adaptive-learning) ───────────────────────────
    // Recompute the student's working level from cumulative evidence on this
    // exam: how many chapters they've PASSED (≥80%) and their average score.
    // Ratchets upward only (see levelProgression.ts); when it climbs, the
    // next chapters/quizzes they open generate at the harder level because
    // content generation reads `currentLevel`. Best-effort — never block
    // completion on it.
    let levelUp: { from: string; to: string } | null = null;
    try {
      const user = await deps.users.get(principal.userId);
      const scores = Object.values(progress.chapterScores) as number[];
      const avgScore = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
      const passedChapters = progress.completedChapters.length;
      const computed = nextLevel(user, passedChapters, avgScore);
      if (isPromotion(user, computed)) {
        const from = user?.currentLevel ?? user?.onboardingLevel ?? 'beginner';
        await deps.users.update(principal.userId, { currentLevel: computed });
        levelUp = { from, to: computed };
        deps.logger.info('study.level_up', {
          userId: principal.userId, exam, from, to: computed, passedChapters, avgScore: Math.round(avgScore),
        });
      }
    } catch (err) {
      deps.logger.warn('study.level_progression_failed', {
        userId: principal.userId, exam, error: err instanceof Error ? err.message : String(err),
      });
    }

    // Award credits via the append-only ledger.
    //
    // Two distinct earn sources, both idempotent on `(userId, exam/subject/chapter)`:
    //   1. chapter_complete -- granted once per chapter regardless of score,
    //      so genuine engagement is rewarded even when the quiz is hard.
    //   2. mcq_pass         -- additionally granted when score >= 80%, the
    //      founder-locked passing threshold (same 80% gate the frontend uses
    //      to unlock the next chapter and that chapterStore uses to mark a
    //      chapter completed — kept consistent so "pass" means one thing).
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

    // 80% is the single passing threshold across the app: it gates the
    // mcq_pass credit, the next-chapter unlock below, the frontend lock UI,
    // and chapterStore's completedChapters. (Was 70% here, which let a 70-79%
    // quiz award "pass" + claim unlock while the frontend still showed the
    // next chapter locked — the mismatch this aligns.)
    const passed = score >= 80;
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

    // Spaced repetition: schedule this chapter for review using SM-2 from the
    // quiz score (low score -> comes back tomorrow, high score -> drifts out).
    // Best-effort; never block chapter completion on it.
    if (deps.review) {
      try {
        await deps.review.schedule(principal.userId, { exam, subject, chapter }, score);
      } catch (err) {
        deps.logger.warn('study.review_schedule_failed', { userId: principal.userId, refKey, error: err instanceof Error ? err.message : String(err) });
      }
    }

    // Determine next chapter (unlock requires a passing score). Use the
    // cache-backed fallback so AI-generated exams (e.g. CGPSC) also resolve
    // a next chapter, not just hardcoded ones. This is a Firestore cache hit
    // in the normal case (the syllabus was cached when the study page loaded).
    let nextChapter: string | null = null;
    let unlocked = false;
    if (passed) {
      try {
        const fallbackDeps: SyllabusFallbackDeps = { env: deps.env, db: deps.db, logger: deps.logger, resolver: deps.modelResolver, aiEngine: deps.aiEngine };
        const syllabus = await getSyllabusWithFallback(exam, resolveExamName(exam), fallbackDeps);
        const subjectData = syllabus?.subjects.find(s => s.slug === subject);
        if (subjectData) {
          const currentIdx = subjectData.chapters.findIndex(ch => ch.slug === chapter);
          if (currentIdx >= 0 && currentIdx < subjectData.chapters.length - 1) {
            nextChapter = subjectData.chapters[currentIdx + 1]!.slug;
            unlocked = true;
          }
        }
      } catch (err) {
        deps.logger.warn('study.next_chapter_lookup_failed', { exam, error: err instanceof Error ? err.message : String(err) });
      }
    }

    deps.logger.info('study.chapter_completed', { userId: principal.userId, exam, subject, chapter, score, unlocked });
    return c.json({ progress, nextChapter, unlocked, creditsAwarded, passed, levelUp });
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
    const hi = ((c.req.query('lang') as 'en' | 'hi') || 'en') === 'hi';

    // Use the cache-backed fallback so analysis works for AI-generated exams
    // (e.g. CGPSC) too, not only hardcoded ones.
    const fallbackDeps: SyllabusFallbackDeps = { env: deps.env, db: deps.db, logger: deps.logger, resolver: deps.modelResolver, aiEngine: deps.aiEngine };
    const [progress, syllabus] = await Promise.all([
      deps.chapters.getProgress(principal.userId, examSlug),
      getSyllabusWithFallback(examSlug, resolveExamName(examSlug), fallbackDeps).catch(() => null),
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
            weakChapters.push({ subject: sub.slug, chapter: ch.slug, chapterName: hi ? (ch.nameHi ?? ch.name) : ch.name, score });
          } else if (score >= 80) {
            strongChapters.push({ subject: sub.slug, chapter: ch.slug, chapterName: hi ? (ch.nameHi ?? ch.name) : ch.name, score });
          }
        }
      }

      subjectBreakdown.push({
        subject: sub.slug,
        subjectName: hi ? (sub.nameHi ?? sub.name) : sub.name,
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

  // GET /v1/study/plan/:examSlug — today's personalized study plan.
  // Composed deterministically (no AI cost) from three signals:
  //   1. Revise  — chapters due today via spaced repetition (SM-2).
  //   2. Fix     — weak chapters (last score < 60) worth redoing.
  //   3. Learn   — the next not-yet-completed chapters in syllabus order.
  app.get('/plan/:examSlug', async (c) => {
    const principal = requireAuth(c);
    const examSlug = c.req.param('examSlug');
    const lang = (c.req.query('lang') as 'en' | 'hi') || 'en';
    const hi = lang === 'hi';
    // Localized reason strings (composed server-side; no AI).
    const reasonRevise = hi ? 'दोहराव के लिए तैयार' : 'Due for spaced revision';
    const reasonLearn = hi ? 'आपके पाठ्यक्रम में अगला' : 'Next in your syllabus';
    const reasonFix = (score: number) => hi ? `पिछला स्कोर ${score}% — इसे मज़बूत करें` : `Last score ${score}% — strengthen this`;

    const fallbackDeps: SyllabusFallbackDeps = { env: deps.env, db: deps.db, logger: deps.logger, resolver: deps.modelResolver, aiEngine: deps.aiEngine };
    const [progress, syllabus, dueItems] = await Promise.all([
      deps.chapters.getProgress(principal.userId, examSlug),
      getSyllabusWithFallback(examSlug, resolveExamName(examSlug), fallbackDeps).catch(() => null),
      deps.review ? deps.review.listDue(principal.userId, new Date().toISOString(), 5).catch(() => []) : Promise.resolve([]),
    ]);

    type PlanItem = { kind: 'revise' | 'fix' | 'learn'; subject: string; chapter: string; chapterName: string; subjectName: string; reason: string; minutes: number; score?: number };
    const items: PlanItem[] = [];
    const used = new Set<string>(); // `${subject}/${chapter}` already added

    const nameLookup = new Map<string, { chapterName: string; subjectName: string }>();
    if (syllabus) {
      for (const sub of syllabus.subjects) {
        for (const ch of sub.chapters) nameLookup.set(`${sub.slug}/${ch.slug}`, { chapterName: hi ? (ch.nameHi ?? ch.name) : ch.name, subjectName: hi ? (sub.nameHi ?? sub.name) : sub.name });
      }
    }
    const pretty = (s: string) => s.replace(/-/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase());

    // 1. Revise (spaced repetition) — up to 3.
    for (const it of dueItems.slice(0, 3)) {
      const key = `${it.subject}/${it.chapter}`;
      if (used.has(key)) continue;
      used.add(key);
      const nm = nameLookup.get(key);
      items.push({ kind: 'revise', subject: it.subject, chapter: it.chapter, chapterName: nm?.chapterName ?? pretty(it.chapter), subjectName: nm?.subjectName ?? pretty(it.subject), reason: reasonRevise, minutes: 10 });
    }

    // 2. Fix weak chapters (last score < 60) — up to 2.
    if (syllabus) {
      const weak: PlanItem[] = [];
      for (const sub of syllabus.subjects) {
        for (const ch of sub.chapters) {
          const key = `${sub.slug}/${ch.slug}`;
          const score = progress.chapterScores[key];
          if (score !== undefined && score < 60 && !used.has(key)) {
            weak.push({ kind: 'fix', subject: sub.slug, chapter: ch.slug, chapterName: hi ? (ch.nameHi ?? ch.name) : ch.name, subjectName: hi ? (sub.nameHi ?? sub.name) : sub.name, reason: reasonFix(score), minutes: 20, score });
          }
        }
      }
      weak.sort((a, b) => (a.score ?? 0) - (b.score ?? 0));
      for (const w of weak.slice(0, 2)) { items.push(w); used.add(`${w.subject}/${w.chapter}`); }
    }

    // 3. Learn next — next not-yet-completed chapters in syllabus order — up to 3.
    if (syllabus) {
      let learnAdded = 0;
      for (const sub of syllabus.subjects) {
        for (const ch of sub.chapters) {
          if (learnAdded >= 3) break;
          const key = `${sub.slug}/${ch.slug}`;
          if (progress.completedChapters.includes(key) || used.has(key)) continue;
          items.push({ kind: 'learn', subject: sub.slug, chapter: ch.slug, chapterName: hi ? (ch.nameHi ?? ch.name) : ch.name, subjectName: hi ? (sub.nameHi ?? sub.name) : sub.name, reason: reasonLearn, minutes: 25 });
          used.add(key);
          learnAdded++;
        }
        if (learnAdded >= 3) break;
      }
    }

    const estMinutes = items.reduce((a, i) => a + i.minutes, 0);
    return c.json({
      date: new Date().toISOString().slice(0, 10),
      exam: examSlug,
      items,
      estMinutes,
      dueCount: dueItems.length,
    });
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

    // Get current syllabus via the full AI fallback (not hardcoded-only) so
    // AI-generated exams like CGPSC also work instead of 404-ing here.
    const examName = resolveExamName(body.examSlug);
    const fallbackDeps: SyllabusFallbackDeps = { env: deps.env, db: deps.db, logger: deps.logger, resolver: deps.modelResolver, aiEngine: deps.aiEngine };
    const baseSyllabus = await getSyllabusWithFallback(body.examSlug, examName, fallbackDeps);
    const syllabus = await mergeAppendedChapters(deps.db, body.examSlug, baseSyllabus);
    if (!syllabus) throw new HTTPException(404, { message: 'Syllabus not found for this exam' });

    const subjectData = syllabus.subjects.find(s => s.slug === body.subjectSlug);
    if (!subjectData) throw new HTTPException(404, { message: 'Subject not found in syllabus' });

    const existingChapters = subjectData.chapters.map(ch => ch.name).join(', ');
    const existingSlugs = new Set(subjectData.chapters.map(ch => ch.slug.toLowerCase()));
    const nextOrder = subjectData.chapters.length + 1;

    type GenChapter = { name: string; slug: string; nameHi: string; estimatedMinutes: number; order: number; isAdvanced: boolean };

    const slugify = (name: string): string =>
      name.toLowerCase().trim()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .slice(0, 60) || `chapter-${Date.now()}`;

    try {
      const prompt = `The student has completed all standard chapters for "${subjectData.name}" in "${syllabus.examName}".
Generate 5 ADVANCED/additional chapter topics that go beyond the standard syllabus but are highly relevant for ${syllabus.examName} preparation.
Existing chapters (do NOT repeat any of these): ${existingChapters}.
Return ONLY a JSON object in EXACTLY this shape:
{"chapters":[{"name":"Chapter Name","nameHi":"हिन्दी नाम","estimatedMinutes":45}]}
Rules: exactly 5 chapters, each name unique and not in the existing list, nameHi in Devanagari, estimatedMinutes between 30 and 60.`;

      // Robust JSON extraction from a model response (handles fenced code,
      // object-wrapped, or bare-array outputs).
      const parseChapters = (raw: string): Array<{ name?: string; nameHi?: string; estimatedMinutes?: number }> => {
        if (!raw) return [];
        let txt = raw.trim().replace(/^```(?:json)?/i, '').replace(/```$/,'').trim();
        try {
          const parsed = JSON.parse(txt);
          if (Array.isArray(parsed)) return parsed;
          if (Array.isArray(parsed?.chapters)) return parsed.chapters;
          return [];
        } catch {
          // Last resort: pull the first [...] array out of the text.
          const m = txt.match(/\[[\s\S]*\]/);
          if (m) { try { const a = JSON.parse(m[0]); return Array.isArray(a) ? a : []; } catch { /* ignore */ } }
          return [];
        }
      };

      // Resilient generation: OpenAI (gpt-4o-mini) -> Groq. Removes the
      // single-point-of-failure where a missing/invalid OpenAI key 503'd
      // the whole "Load More Chapters" feature.
      let rawList: Array<{ name?: string; nameHi?: string; estimatedMinutes?: number }> = [];
      const genErrors: string[] = [];

      if (deps.env.OPENAI_API_KEY && deps.env.OPENAI_API_KEY.length > 5) {
        try {
          const OpenAI = (await import('openai')).default;
          const openai = new OpenAI({ apiKey: deps.env.OPENAI_API_KEY });
          const completion = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.7,
            max_tokens: 1500,
            response_format: { type: 'json_object' },
          });
          rawList = parseChapters(completion.choices[0]?.message?.content ?? '');
        } catch (err) {
          genErrors.push(`OpenAI: ${err instanceof Error ? err.message : String(err)}`);
          deps.logger.warn('study.generate_chapters_openai_failed', { error: genErrors[genErrors.length - 1] });
        }
      }

      if (rawList.length === 0 && deps.env.GROQ_API_KEY && deps.env.GROQ_API_KEY.length > 5) {
        try {
          const Groq = (await import('groq-sdk')).default;
          const groq = new Groq({ apiKey: deps.env.GROQ_API_KEY });
          const completion = await groq.chat.completions.create({
            model: 'llama-3.3-70b-versatile',
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.7,
            max_tokens: 1500,
            response_format: { type: 'json_object' },
          });
          rawList = parseChapters(completion.choices[0]?.message?.content ?? '');
        } catch (err) {
          genErrors.push(`Groq: ${err instanceof Error ? err.message : String(err)}`);
          deps.logger.warn('study.generate_chapters_groq_failed', { error: genErrors[genErrors.length - 1] });
        }
      }

      if (rawList.length === 0) {
        throw new Error(`AI returned no chapters${genErrors.length ? ` (${genErrors.join('; ')})` : ''}`);
      }

      // Normalize, dedup (against existing + within the batch), cap at 5.
      const batchSlugs = new Set<string>();
      const newChapters: GenChapter[] = [];
      for (const item of rawList) {
        const name = (item?.name ?? '').toString().trim();
        if (!name) continue;
        let slug = slugify(name);
        if (existingSlugs.has(slug) || batchSlugs.has(slug)) continue; // skip duplicates
        batchSlugs.add(slug);
        const mins = Number(item?.estimatedMinutes);
        newChapters.push({
          name,
          slug,
          nameHi: (item?.nameHi ?? name).toString().trim(),
          estimatedMinutes: Number.isFinite(mins) ? Math.min(60, Math.max(30, Math.round(mins))) : 45,
          order: nextOrder + newChapters.length,
          isAdvanced: true,
        });
        if (newChapters.length >= 5) break;
      }

      if (newChapters.length === 0) {
        throw new Error('All generated chapters were duplicates');
      }

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
