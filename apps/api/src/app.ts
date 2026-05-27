import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { HTTPException } from 'hono/http-exception';
import type { Env } from './env.js';
import { getFirebaseAuth, getFirebaseFirestore } from './lib/firebaseAdmin.js';
import { FirestoreUserStore, InMemoryUserStore, type UserStore } from './lib/userStore.js';
import { createAIEngine, type AIEngine } from './lib/aiEngine.js';
import { InMemoryChapterStore, FirestoreChapterStore, type ChapterStore } from './lib/chapterStore.js';
import { InMemoryCurrentAffairsStore, FirestoreCurrentAffairsStore, type CurrentAffairsStore } from './lib/currentAffairsStore.js';
import { InMemoryAdminStore, FirestoreAdminStore, type AdminStore } from './lib/adminStore.js';
import { authMiddleware } from './auth.js';
import type { Logger } from './logger.js';
import { makeHealthRoutes, makeDiagRoutes } from './routes/health.js';
import { makeUsersRoutes } from './routes/users.js';
import { makeAssessmentRoutes } from './routes/assessment.js';
import { makeStudyRoutes } from './routes/study.js';
import { makeCurrentAffairsRoutes } from './routes/currentAffairs.js';
import { InMemoryChatStore, FirestoreChatStore, type ChatStore } from './lib/chatStore.js';
import { makeChatRoutes } from './routes/chat.js';
import { makeCreditsRoutes } from './routes/credits.js';
import { makeBillingRoutes } from './routes/billing.js';
import { makeAdminRoutes } from './routes/admin.js';
import { makeSupportRoutes } from './routes/support.js';
import { InMemoryCouponStore, FirestoreCouponStore, type CouponStore } from './lib/couponStore.js';

export interface AppDeps { env: Env; logger: Logger; users?: UserStore; aiEngine?: AIEngine; chapters?: ChapterStore; currentAffairs?: CurrentAffairsStore; chatStore?: ChatStore; adminStore?: AdminStore; couponStore?: CouponStore; }

export function buildApp(deps: AppDeps): Hono {
  const { env, logger } = deps;
  const useFirestore = env.PERSISTENCE === 'firestore';
  const fs = useFirestore ? getFirebaseFirestore(env) : null;
  const users = deps.users ?? (fs ? new FirestoreUserStore(fs) : new InMemoryUserStore());
  const adminStore = deps.adminStore ?? (fs ? new FirestoreAdminStore(fs) : new InMemoryAdminStore());
  const aiEngine = deps.aiEngine ?? createAIEngine(env, logger, adminStore);
  const chapters = deps.chapters ?? (fs ? new FirestoreChapterStore(fs) : new InMemoryChapterStore());
  const currentAffairs = deps.currentAffairs ?? (fs ? new FirestoreCurrentAffairsStore(fs) : new InMemoryCurrentAffairsStore());
  const chatStore = deps.chatStore ?? (fs ? new FirestoreChatStore(fs) : new InMemoryChatStore());
  const couponStore = deps.couponStore ?? (fs ? new FirestoreCouponStore(fs) : new InMemoryCouponStore());
  const firebaseAuth = getFirebaseAuth(env);

  const app = new Hono();

  app.use('*', cors({
    origin: (origin) => (env.CORS_ALLOWED_ORIGINS.includes(origin) ? origin : null),
    allowMethods: ['GET','POST','PATCH','DELETE','OPTIONS'],
    allowHeaders: ['Authorization','Content-Type','X-User-Email','X-User-Name','X-User-Photo','X-User-Provider','x-cron-secret'],
    maxAge: 600, credentials: true,
  }));

  app.use('*', async (c, next) => {
    const start = performance.now();
    const rid = c.req.header('x-request-id') ?? crypto.randomUUID();
    c.header('x-request-id', rid);
    await next();
    logger.info('request', { method: c.req.method, path: c.req.path, status: c.res.status, ms: Math.round(performance.now()-start), rid });
  });

  // Rate limiting for AI endpoints (Fix #29)
  const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
  app.use('/v1/chat/*', async (c, next) => {
    const userId = c.req.header('authorization')?.slice(0, 40) ?? c.req.header('x-forwarded-for') ?? 'anon';
    const now = Date.now();
    const entry = rateLimitMap.get(userId);
    if (entry && entry.resetAt > now) {
      if (entry.count >= 30) { // 30 requests per minute for AI endpoints
        return c.json({ error: 'Rate limit exceeded. Please wait a moment.' }, 429);
      }
      entry.count++;
    } else {
      rateLimitMap.set(userId, { count: 1, resetAt: now + 60000 });
    }
    // Cleanup old entries periodically
    if (rateLimitMap.size > 10000) {
      for (const [key, val] of rateLimitMap) { if (val.resetAt < now) rateLimitMap.delete(key); }
    }
    await next();
  });

  app.use('/v1/study/*', async (c, next) => {
    const userId = c.req.header('authorization')?.slice(0, 40) ?? c.req.header('x-forwarded-for') ?? 'anon';
    const now = Date.now();
    const key = `study_${userId}`;
    const entry = rateLimitMap.get(key);
    if (entry && entry.resetAt > now) {
      if (entry.count >= 20) { // 20 requests per minute for study
        return c.json({ error: 'Rate limit exceeded. Please wait a moment.' }, 429);
      }
      entry.count++;
    } else {
      rateLimitMap.set(key, { count: 1, resetAt: now + 60000 });
    }
    await next();
  });

  // Payload size validation (Fix #30) - reject bodies > 10MB
  app.use('*', async (c, next) => {
    const contentLength = c.req.header('content-length');
    if (contentLength && parseInt(contentLength) > 10 * 1024 * 1024) {
      return c.json({ error: 'Request body too large. Maximum 10MB allowed.' }, 413);
    }
    await next();
  });

  app.route('/', makeHealthRoutes());
  app.route('/', makeDiagRoutes(env));
  app.get('/', (c) => c.json({ service: 'nexigrate-api', version: '1.0.0' }));

  // Cron endpoint — NO auth required (uses x-cron-secret header instead)
  const cronRoutes = makeCurrentAffairsRoutes({ users, aiEngine, currentAffairs, env, logger });
  app.post('/v1/current-affairs/ingest', async (c) => {
    const cronSecret = c.req.header('x-cron-secret');
    if (cronSecret !== env.CRON_SECRET) {
      return c.json({ error: 'unauthorized' }, 401);
    }
    const { ingestCurrentAffairs } = await import('./lib/rssIngestion.js');
    const result = await ingestCurrentAffairs(currentAffairs, env, logger, aiEngine);
    await currentAffairs.setLastIngestedAt(new Date().toISOString());
    return c.json({ success: true, ...result });
  });

  const v1 = new Hono();
  v1.use('*', authMiddleware(firebaseAuth));
  v1.route('/users', makeUsersRoutes({ users, logger, db: fs }));
  v1.route('/assessment', makeAssessmentRoutes({ users, aiEngine, logger }));
  v1.route('/study', makeStudyRoutes({ users, aiEngine, chapters, logger, db: fs, env }));
  v1.route('/current-affairs', cronRoutes);
  v1.route('/chat', makeChatRoutes({ users, aiEngine, chat: chatStore, logger, env }));
  v1.route('/credits', makeCreditsRoutes({ users, logger, db: fs }));
  v1.route('/billing', makeBillingRoutes({ users, env, logger, db: fs, coupons: couponStore }));
  v1.route('/admin', makeAdminRoutes({ users, adminStore, env, logger, coupons: couponStore }));
  v1.route('/support', makeSupportRoutes({ users, db: fs, logger }));

  // POST /v1/logs/error — web app error reporting (no auth required for error boundary)
  v1.post('/logs/error', async (c) => {
    const body = await c.req.json().catch(() => null) as { message?: string; stack?: string; route?: string; userId?: string } | null;
    if (body?.message) {
      await adminStore.logError({ id: crypto.randomUUID(), message: body.message, stack: body.stack, route: body.route, userId: body.userId, timestamp: new Date().toISOString(), severity: 'warning' });
    }
    return c.json({ ok: true });
  });

  // GET /v1/branding — public branding settings (logo, favicon, tagline) — no auth required
  v1.get('/branding', async (c) => {
    try {
      const settings = await adminStore.getSeoSettings();
      return c.json({
        logoUrl: settings?.logoUrl || '',
        favicon: settings?.favicon || '',
        tagline: settings?.tagline || 'Study Smarter, Score Higher',
        taglineHi: settings?.taglineHi || 'स्मार्ट पढ़ो, ज़्यादा स्कोर करो',
      });
    } catch {
      return c.json({ logoUrl: '', favicon: '', tagline: 'Study Smarter, Score Higher', taglineHi: '' });
    }
  });

  // GET /v1/announcements — active announcements for users (non-admin)
  v1.get('/announcements', async (c) => {
    try {
      const all = await adminStore.getAnnouncements();
      const now = new Date().toISOString();
      const active = all.filter(a =>
        a.isActive &&
        (!a.expiresAt || a.expiresAt > now)
      );
      return c.json({ announcements: active });
    } catch {
      return c.json({ announcements: [] });
    }
  });

  app.route('/v1', v1);

  app.onError((err, c) => {
    if (err instanceof HTTPException) { logger.warn('http.error', { status: err.status, message: err.message }); return c.json({ error: err.message }, err.status); }
    logger.error('unhandled', { message: err.message, stack: err.stack });
    // Log to admin store for error tracking
    adminStore.logError({ id: crypto.randomUUID(), message: err.message, stack: err.stack, route: c.req.path, timestamp: new Date().toISOString(), severity: 'critical' }).catch(() => {});
    return c.json({ error: 'internal server error' }, 500);
  });

  app.notFound((c) => c.json({ error: 'not found' }, 404));
  return app;
}
