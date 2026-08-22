import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { requireAuth } from '../auth.js';
import type { Logger } from '../logger.js';
import type { UserStore } from '../lib/userStore.js';
import type { AIEngine } from '../lib/aiEngine.js';
import type { PYQStore } from '../lib/pyqStore.js';
import { pyqPaperId } from '../lib/pyqStore.js';
import type { PlatformConfigStore } from '../lib/platformConfigStore.js';
import { PlanGate, FeatureKey } from '../lib/planGate.js';
import {
  isExamSlug,
  EXAM_BY_SLUG,
  asExamSlug,
  nowIso,
  type PYQPaper,
  type PYQQuestion,
} from '@nexigrate/shared';

/**
 * Previous Year Questions (PYQ) routes.
 *
 * Student-facing:
 *   GET  /v1/pyq/:examSlug            → available years (auto-seeds the
 *                                       most recent year on first hit)
 *   GET  /v1/pyq/:examSlug/:year      → full paper (generates + caches
 *                                       on demand, shared across users)
 *
 * Admin-only (role === 'admin'), registered BEFORE the dynamic routes so
 * "admin" isn't captured as an exam slug:
 *   GET    /v1/pyq/admin/all          → every cached paper
 *   POST   /v1/pyq/admin/generate     → (re)generate a paper
 *   PUT    /v1/pyq/admin/:id          → curate/verify/edit a paper
 *   DELETE /v1/pyq/admin/:id          → remove a paper
 */

export interface PYQRoutesDeps {
  users: UserStore;
  aiEngine: AIEngine;
  pyq: PYQStore;
  logger: Logger;
  /** Admin-editable plan matrix — gates full-paper access (pyqAccess). Optional for tests. */
  config?: PlatformConfigStore;
}

const DISCLAIMER_EN =
  'AI-reconstructed practice set modelled on this exam\u2019s previous-year pattern (topics, weightage & difficulty). Not a verbatim copy of the official paper.';
const DISCLAIMER_HI =
  'यह इस परीक्षा के पिछले वर्ष के पैटर्न (विषय, भार व कठिनाई) पर आधारित AI-निर्मित अभ्यास सेट है। यह आधिकारिक प्रश्नपत्र की हूबहू प्रति नहीं है।';

/** Acceptable PYQ year window. */
function yearBounds(): { min: number; max: number } {
  const now = new Date().getFullYear();
  return { min: 2010, max: now };
}

/** Default "last exam" year — the most recently concluded session. */
function defaultLatestYear(): number {
  return new Date().getFullYear() - 1;
}

export function makePYQRoutes(deps: PYQRoutesDeps): Hono {
  const app = new Hono();
  // Gate opening a FULL paper behind pyqAccess (Free can browse the year list
  // but not open papers). Fail-open if config isn't wired.
  const planGate = deps.config ? new PlanGate({ config: deps.config, logger: deps.logger }) : null;

  const requireAdmin = async (c: any) => {
    const principal = requireAuth(c);
    const user = await deps.users.get(principal.userId);
    if (user?.role !== 'admin') throw new HTTPException(403, { message: 'admin only' });
    return principal;
  };

  /** Generate + cache a paper if it doesn't already exist. Shared by all users. */
  async function ensurePaper(examSlug: string, year: number, language: 'en' | 'hi'): Promise<PYQPaper> {
    const existing = await deps.pyq.getPaper(examSlug, year, language);
    if (existing) return existing;

    const exam = EXAM_BY_SLUG.get(asExamSlug(examSlug));
    const examName = exam?.name ?? examSlug;
    const questions = (await deps.aiEngine.generatePYQPaper(examSlug, examName, year, language)) as PYQQuestion[];
    if (!questions || questions.length === 0) {
      throw new HTTPException(503, { message: 'Could not generate the paper right now. AI service may be busy — try again in a minute.' });
    }
    const now = nowIso();
    const paper: PYQPaper = {
      id: pyqPaperId(examSlug, year, language),
      examSlug: asExamSlug(examSlug),
      examName,
      year,
      language,
      source: 'ai-pattern',
      verified: false,
      questions,
      note: language === 'hi' ? DISCLAIMER_HI : DISCLAIMER_EN,
      generatedBy: 'ai',
      createdAt: now,
      updatedAt: now,
    };
    await deps.pyq.savePaper(paper);
    deps.logger.info('pyq.paper_generated', { examSlug, year, language, count: questions.length });
    return paper;
  }

  // ─── Admin (registered first so '/admin/...' beats '/:examSlug/:year') ───

  app.get('/admin/all', async (c) => {
    await requireAdmin(c);
    const papers = await deps.pyq.listAll();
    return c.json({ papers });
  });

  app.post('/admin/generate', async (c) => {
    await requireAdmin(c);
    const body = await c.req.json().catch(() => null) as { examSlug?: string; year?: number; language?: 'en' | 'hi'; force?: boolean } | null;
    if (!body?.examSlug || !isExamSlug(body.examSlug)) throw new HTTPException(400, { message: 'valid examSlug required' });
    const language = body.language === 'hi' ? 'hi' : 'en';
    const { min, max } = yearBounds();
    const year = typeof body.year === 'number' ? body.year : defaultLatestYear();
    if (year < min || year > max) throw new HTTPException(400, { message: `year must be between ${min} and ${max}` });

    // force => regenerate even if cached
    if (body.force) await deps.pyq.deletePaper(pyqPaperId(body.examSlug, year, language));
    const paper = await ensurePaper(body.examSlug, year, language);
    return c.json({ paper });
  });

  app.put('/admin/:id', async (c) => {
    await requireAdmin(c);
    const id = c.req.param('id');
    const body = await c.req.json().catch(() => null) as Partial<PYQPaper> | null;
    if (!body) throw new HTTPException(400, { message: 'body required' });
    const existing = await (async () => {
      // id is `${examSlug}_${year}_${language}` — fetch via listAll match
      // to avoid re-parsing; but a direct read is cheaper. Reconstruct
      // the lookup from the id parts.
      const parts = id.split('_');
      const language = parts[parts.length - 1] === 'hi' ? 'hi' : 'en';
      const year = Number(parts[parts.length - 2]);
      const examSlug = parts.slice(0, parts.length - 2).join('_');
      if (!Number.isFinite(year)) return null;
      return deps.pyq.getPaper(examSlug, year, language);
    })();
    if (!existing) throw new HTTPException(404, { message: 'paper not found' });

    const updated: PYQPaper = {
      ...existing,
      // Only allow curation-relevant fields to be overwritten.
      ...(Array.isArray(body.questions) ? { questions: body.questions } : {}),
      ...(typeof body.verified === 'boolean' ? { verified: body.verified } : {}),
      ...(body.source === 'admin-verified' || body.source === 'ai-pattern' ? { source: body.source } : {}),
      ...(typeof body.note === 'string' ? { note: body.note } : {}),
      updatedAt: nowIso(),
    };
    await deps.pyq.savePaper(updated);
    deps.logger.info('pyq.paper_curated', { id, verified: updated.verified, source: updated.source });
    return c.json({ paper: updated });
  });

  app.delete('/admin/:id', async (c) => {
    await requireAdmin(c);
    const id = c.req.param('id');
    await deps.pyq.deletePaper(id);
    deps.logger.info('pyq.paper_deleted', { id });
    return c.json({ success: true });
  });

  // ─── Student-facing ───

  // GET /v1/pyq/:examSlug — available years (auto-seeds the latest year).
  app.get('/:examSlug', async (c) => {
    requireAuth(c);
    const examSlug = c.req.param('examSlug');
    if (!isExamSlug(examSlug)) throw new HTTPException(404, { message: 'Unknown exam' });
    const language = (c.req.query('lang') as 'en' | 'hi') || 'en';

    let years = await deps.pyq.listSummaries(examSlug, language);
    // First visitor for this exam: seed the most recent year so the page
    // is never empty. Best-effort — if generation fails we still return
    // whatever is cached (possibly nothing) with a 200 so the UI can show
    // a friendly empty state instead of erroring.
    if (years.length === 0) {
      try {
        await ensurePaper(examSlug, defaultLatestYear(), language);
        years = await deps.pyq.listSummaries(examSlug, language);
      } catch (e) {
        deps.logger.warn('pyq.seed_failed', { examSlug, error: e instanceof Error ? e.message : String(e) });
      }
    }
    const exam = EXAM_BY_SLUG.get(asExamSlug(examSlug));
    return c.json({ examSlug, examName: exam?.name ?? examSlug, years });
  });

  // GET /v1/pyq/:examSlug/:year — the full paper (generate + cache on demand).
  app.get('/:examSlug/:year', async (c) => {
    const principal = requireAuth(c);
    const examSlug = c.req.param('examSlug');
    if (!isExamSlug(examSlug)) throw new HTTPException(404, { message: 'Unknown exam' });
    const language = (c.req.query('lang') as 'en' | 'hi') || 'en';
    const year = Number(c.req.param('year'));
    const { min, max } = yearBounds();
    if (!Number.isFinite(year) || year < min || year > max) {
      throw new HTTPException(400, { message: `year must be between ${min} and ${max}` });
    }

    // Plan gate: opening a full PYQ paper needs pyqAccess (paid). Free users
    // can still browse the year list above; this is the upgrade trigger.
    // Expiry-aware. Fail-open if config isn't wired.
    if (planGate) {
      const user = await deps.users.get(principal.userId);
      const gate = await planGate.enforce(user, FeatureKey.PYQ_ACCESS, language);
      if (!gate.ok) return c.json(gate.body, gate.status);
    }

    const paper = await ensurePaper(examSlug, year, language);
    return c.json({ paper });
  });

  return app;
}
