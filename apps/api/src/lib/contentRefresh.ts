import { asISODateTime } from '@nexigrate/shared';
import type { AIEngine } from './aiEngine.js';
import type { ChapterStore, ChapterContent, UserContext } from './chapterStore.js';
import type { Logger } from '../logger.js';

/**
 * Weekly content auto-update.
 *
 * Cached AI chapter content (chapter_content/{...}) carries a `generatedAt`
 * timestamp. Content older than CONTENT_REFRESH_DAYS is "stale":
 *   • served instantly to the reader (never block on regeneration), and
 *   • regenerated in the background so the NEXT reader gets fresh content.
 *
 * The weekly cron (POST /v1/study/content-refresh) proactively regenerates
 * the stalest batch so popular content stays current even without a visit.
 *
 * Cost for background/cron regeneration is recorded against a dedicated
 * system bucket so it shows up in admin AI-cost reporting without touching
 * any real user's daily cap.
 */

export const SYSTEM_REFRESH_USER = 'system:content-refresh';

/** In-process guard so concurrent readers don't fire duplicate regenerations. */
const inFlight = new Set<string>();

export interface ContentRefreshDeps {
  aiEngine: AIEngine;
  chapters: ChapterStore;
  logger: Logger;
}

function refreshKey(c: Pick<ChapterContent, 'exam' | 'subject' | 'chapter' | 'language' | 'userLevel'>): string {
  return `${c.exam}_${c.subject}_${c.chapter}_${c.language}_${c.userLevel ?? ''}`;
}

/** True when content is missing a timestamp or older than `maxAgeDays`. */
export function isStale(generatedAt: string | undefined, maxAgeDays: number): boolean {
  if (!generatedAt) return true;
  const gen = Date.parse(generatedAt);
  if (Number.isNaN(gen)) return false;
  return Date.now() - gen > maxAgeDays * 86_400_000;
}

/**
 * Regenerate one chapter's content at its existing level/language and
 * overwrite the cache. Returns true on success. Never throws — failures are
 * logged and swallowed so callers (background trigger, cron loop) stay safe.
 */
export async function regenerateChapterContent(
  deps: ContentRefreshDeps,
  prev: ChapterContent,
): Promise<boolean> {
  const key = refreshKey(prev);
  if (inFlight.has(key)) return false;
  inFlight.add(key);
  try {
    const level = prev.userLevel ?? 'intermediate';
    // Level-tier context only (no user-specific weakAreas) so the refreshed
    // content is the canonical version for that tier — matching the
    // pre-generation strategy where each level has ideal, clean content.
    const ctx: UserContext = {
      targetExam: String(prev.exam),
      onboardingScore: 0,
      onboardingLevel: level,
      completedChapters: [],
      weakAreas: [],
      strongAreas: [],
    };
    const markdown = await deps.aiEngine.generateChapterContent(
      prev.chapter,
      prev.subject,
      String(prev.exam),
      prev.language,
      ctx,
    );
    if (!markdown || markdown.trim().length < 50) {
      deps.logger.warn('content.refresh_empty', { exam: prev.exam, subject: prev.subject, chapter: prev.chapter });
      return false;
    }
    await deps.chapters.saveChapter({
      ...prev,
      content: markdown,
      generatedAt: asISODateTime(new Date().toISOString()),
      generatedBy: prev.generatedBy || 'auto-refresh',
      userLevel: level,
      contentPersonalizedFor: level,
    });
    await deps.aiEngine.recordAICost(SYSTEM_REFRESH_USER, 0.05);
    deps.logger.info('content.refreshed', {
      exam: prev.exam, subject: prev.subject, chapter: prev.chapter, language: prev.language, level,
    });
    return true;
  } catch (err) {
    deps.logger.warn('content.refresh_failed', {
      exam: prev.exam, subject: prev.subject, chapter: prev.chapter,
      error: err instanceof Error ? err.message : String(err),
    });
    return false;
  } finally {
    inFlight.delete(key);
  }
}

/**
 * Fire-and-forget background regeneration if the content is stale. Safe to
 * call from a request handler — it never blocks and never throws.
 */
export function triggerBackgroundRefresh(
  deps: ContentRefreshDeps,
  prev: ChapterContent,
  maxAgeDays: number,
): void {
  if (!isStale(prev.generatedAt, maxAgeDays)) return;
  void regenerateChapterContent(deps, prev);
}

/**
 * Weekly cron worker: regenerate the stalest `limit` cached chapters.
 * Returns counts for observability.
 */
export async function refreshStaleContent(
  deps: ContentRefreshDeps,
  maxAgeDays: number,
  limit: number,
): Promise<{ scanned: number; refreshed: number }> {
  const cutoff = new Date(Date.now() - maxAgeDays * 86_400_000).toISOString();
  const stale = await deps.chapters.listStaleChapters(cutoff, limit);
  let refreshed = 0;
  for (const chapter of stale) {
    // Sequential on purpose: keeps provider load + cost predictable per run.
    const ok = await regenerateChapterContent(deps, chapter);
    if (ok) refreshed += 1;
  }
  deps.logger.info('content.refresh_batch_done', { scanned: stale.length, refreshed, maxAgeDays });
  return { scanned: stale.length, refreshed };
}
