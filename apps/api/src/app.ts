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
import { FirestoreAIProviderStore, InMemoryAIProviderStore, type AIProviderStore } from './lib/aiProviderStore.js';
import { DefaultAIModelResolver, type AIModelResolver } from './lib/aiModelResolver.js';
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
import { makeBillingRoutes, makeBillingWebhookRoute } from './routes/billing.js';
import { makeAdminRoutes } from './routes/admin.js';
import { makeSupportRoutes } from './routes/support.js';
import { makeEssayRoutes } from './routes/essay.js';
import { InMemoryCouponStore, FirestoreCouponStore, type CouponStore } from './lib/couponStore.js';
import { FirestoreIdempotencyStore, InMemoryIdempotencyStore, type IdempotencyStore } from './lib/idempotency.js';
import { FirestoreCreditLedger, InMemoryCreditLedger, type CreditLedger } from './lib/creditLedger.js';
import { FirestorePlatformConfigStore, InMemoryPlatformConfigStore, type PlatformConfigStore } from './lib/platformConfigStore.js';
import { FirestoreMockTestStore, InMemoryMockTestStore, type MockTestStore } from './lib/mockTestStore.js';
import { FirestoreAISpendStore, InMemoryAISpendStore, type AISpendStore, DEFAULT_DAILY_AI_CAP_USD } from './lib/aiSpendStore.js';
import { FirestoreBlogStore, InMemoryBlogStore, type BlogStore } from './lib/blogStore.js';
import { FirestoreServiceKeyStore, InMemoryServiceKeyStore, type ServiceKeyStore } from './lib/serviceKeyStore.js';
import { createPushService, type PushService } from './lib/pushService.js';
import { FirestoreTeamInviteStore, InMemoryTeamInviteStore, type TeamInviteStore } from './lib/teamInviteStore.js';
import { FirestoreEmailMarketingStore, InMemoryEmailMarketingStore, type EmailMarketingStore } from './lib/emailMarketingStore.js';
import { makePublicRoutes } from './routes/public.js';
import { makeMockTestRoutes } from './routes/mockTests.js';

export interface AppDeps { env: Env; logger: Logger; users?: UserStore; aiEngine?: AIEngine; chapters?: ChapterStore; currentAffairs?: CurrentAffairsStore; chatStore?: ChatStore; adminStore?: AdminStore; couponStore?: CouponStore; idempotency?: IdempotencyStore; ledger?: CreditLedger; config?: PlatformConfigStore; mockTests?: MockTestStore; blog?: BlogStore; aiProviderStore?: AIProviderStore; modelResolver?: AIModelResolver; serviceKeys?: ServiceKeyStore; push?: PushService; teamInvites?: TeamInviteStore; }

export function buildApp(deps: AppDeps): Hono {
  const { env, logger } = deps;
  const useFirestore = env.PERSISTENCE === 'firestore';
  const fs = useFirestore ? getFirebaseFirestore(env) : null;
  const users = deps.users ?? (fs ? new FirestoreUserStore(fs) : new InMemoryUserStore());
  const adminStore = deps.adminStore ?? (fs ? new FirestoreAdminStore(fs) : new InMemoryAdminStore());
  const aiSpend: AISpendStore = fs ? new FirestoreAISpendStore(fs) : new InMemoryAISpendStore();
  // PR-29: provider config + resolver. Wired BEFORE the engine so the
  // engine's verifier callbacks resolve the topmost-currently-working
  // model on each call. Falls back to env-only behaviour if no
  // Firestore (in-memory dev / test path).
  const aiProviderStore = deps.aiProviderStore ?? (fs ? new FirestoreAIProviderStore(fs) : new InMemoryAIProviderStore());
  const modelResolver = deps.modelResolver ?? new DefaultAIModelResolver(aiProviderStore, env, logger);
  const aiEngine = deps.aiEngine ?? createAIEngine(env, logger, adminStore, aiSpend, modelResolver);
  const chapters = deps.chapters ?? (fs ? new FirestoreChapterStore(fs) : new InMemoryChapterStore());
  const currentAffairs = deps.currentAffairs ?? (fs ? new FirestoreCurrentAffairsStore(fs) : new InMemoryCurrentAffairsStore());
  const chatStore = deps.chatStore ?? (fs ? new FirestoreChatStore(fs) : new InMemoryChatStore());
  const couponStore = deps.couponStore ?? (fs ? new FirestoreCouponStore(fs) : new InMemoryCouponStore());
  const idempotency = deps.idempotency ?? (fs ? new FirestoreIdempotencyStore(fs) : new InMemoryIdempotencyStore());
  const ledger = deps.ledger ?? (fs ? new FirestoreCreditLedger(fs, logger) : new InMemoryCreditLedger());
  const config = deps.config ?? (fs ? new FirestorePlatformConfigStore(fs, logger) : new InMemoryPlatformConfigStore());
  const mockTests = deps.mockTests ?? (fs ? new FirestoreMockTestStore(fs) : new InMemoryMockTestStore());
  const blog = deps.blog ?? (fs ? new FirestoreBlogStore(fs) : new InMemoryBlogStore());
  // PR-37: Razorpay / Resend / WhatsApp / FCM keys come from this store
  // first, env vars second. Mirrors the AI Providers pattern (PR-29) but
  // for non-AI third-party services so the founder can rotate them from
  // the admin panel without redeploys.
  const serviceKeys = deps.serviceKeys ?? (fs ? new FirestoreServiceKeyStore(fs) : new InMemoryServiceKeyStore());
  // PR-38: push notification dispatcher (FCM Admin SDK). Always
  // constructed so call sites don't have to null-check; isConfigured()
  // gates whether sends actually fire.
  const push = deps.push ?? createPushService(env, logger, serviceKeys);
  // PR-40: team invite store for RBAC
  const teamInvites = deps.teamInvites ?? (fs ? new FirestoreTeamInviteStore(fs) : new InMemoryTeamInviteStore());
  // Email Marketing: config, logs, templates for admin panel
  const emailMarketing: EmailMarketingStore = fs ? new FirestoreEmailMarketingStore(fs, logger) : new InMemoryEmailMarketingStore();
  const firebaseAuth = getFirebaseAuth(env);

  const app = new Hono();

  app.use('*', cors({
    origin: (origin) => (env.CORS_ALLOWED_ORIGINS.includes(origin) ? origin : null),
    allowMethods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'],
    allowHeaders: ['Authorization','Content-Type','X-User-Email','X-User-Name','X-User-Photo','X-User-Provider','x-cron-secret','Idempotency-Key'],
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
  app.route('/', makeDiagRoutes(env, modelResolver));
  app.get('/', (c) => c.json({ service: 'nexigrate-api', version: '1.0.0' }));

  // Razorpay webhook — MUST be mounted BEFORE the auth-gated /v1 router so
  // that Razorpay's POST (which carries no Bearer token, only an HMAC
  // signature) is not rejected by authMiddleware. Trust is established by
  // verifying the x-razorpay-signature header against the raw request body
  // inside makeBillingWebhookRoute.
  app.route('/v1/billing', makeBillingWebhookRoute({
    users, env, logger, db: fs, coupons: couponStore, idempotency, serviceKeys,
  }));

  // Public endpoints (no Firebase ID token required) -- mounted BEFORE the
  // /v1 auth gate. Today this covers:
  //   POST /v1/logs/error  -- the front-end error boundary fires this on a
  //     React render crash, when getIdToken() may itself have failed. Was
  //     auth-gated pre-PR-06 which silently dropped every crash report.
  //   GET  /v1/branding    -- splash-screen boot data (logo, tagline,
  //     welcome-bonus preview). Used before sign-in, so cannot require auth.
  // Both have their own validation + rate limiting inside makePublicRoutes.
  app.route('/v1', makePublicRoutes({ adminStore, config, logger, blog, firebaseAuth, serviceKeys, env }));

  // Cron endpoint — NO auth required (uses x-cron-secret header instead)
  const cronRoutes = makeCurrentAffairsRoutes({ users, aiEngine, currentAffairs, env, logger });
  app.post('/v1/current-affairs/ingest', async (c) => {
    const cronSecret = c.req.header('x-cron-secret');
    if (cronSecret !== env.CRON_SECRET) {
      return c.json({ error: 'unauthorized' }, 401);
    }
    const { ingestCurrentAffairs } = await import('./lib/rssIngestion.js');
    const result = await ingestCurrentAffairs(currentAffairs, env, logger, aiEngine, modelResolver);
    await currentAffairs.setLastIngestedAt(new Date().toISOString());
    return c.json({ success: true, ...result });
  });

  // Cron endpoint — streak reminder (Cloud Scheduler: daily 7pm IST)
  app.post('/v1/notifications/streak-check', async (c) => {
    const cronSecret = c.req.header('x-cron-secret');
    if (cronSecret !== env.CRON_SECRET) {
      return c.json({ error: 'unauthorized' }, 401);
    }
    logger.info('cron.streak_check_start');
    let sent = 0;
    let skipped = 0;
    try {
      const { createEmailService } = await import('./lib/emailService.js');
      const emailService = createEmailService(env, logger, serviceKeys, emailMarketing);

      // Query users who haven't been active today (streak at risk)
      if (fs) {
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const todayISO = todayStart.toISOString();

        // Get users with active streaks who haven't logged in today
        const snap = await fs.collection('users')
          .where('currentStreak', '>', 0)
          .limit(500)
          .get();

        for (const doc of snap.docs) {
          const u = doc.data() as { email?: string; name?: string; currentStreak?: number; lastDailyAt?: string; language?: string };
          // Skip if already active today
          if (u.lastDailyAt && u.lastDailyAt >= todayISO) { skipped++; continue; }
          // Skip if no email
          if (!u.email) { skipped++; continue; }

          const success = await emailService.sendStreakReminder(
            u.email,
            u.name ?? 'Student',
            u.currentStreak ?? 0,
            (u.language as 'en' | 'hi') ?? 'en',
          );
          if (success) sent++;
        }
      }
      logger.info('cron.streak_check_done', { sent, skipped });
      return c.json({ success: true, sent, skipped });
    } catch (err) {
      logger.error('cron.streak_check_error', { error: err instanceof Error ? err.message : String(err) });
      return c.json({ success: false, error: 'Streak check failed' }, 500);
    }
  });

  const v1 = new Hono();
  v1.use('*', authMiddleware(firebaseAuth));

  // ─── AI cost cap enforcement (lock §3.8) ────────────────────────────
  // Runs before any AI-heavy route. Reads the user's running daily
  // spend; if it has crossed the per-plan cap, returns 429 with a
  // friendly message. Spend itself is recorded AFTER each call (in
  // logAICallToStore) so the next request sees the updated total.
  //
  // Why pre-check rather than per-call: if the user is already over the
  // cap, we don't even want to spin up the AI provider call (which
  // costs us money we won't recoup). Pre-check is a single Firestore
  // doc.get() per request -- cheap.
  const AI_GATED_PREFIXES = ['/study/', '/chat/', '/mock-tests/', '/essay/', '/assessment/'];
  v1.use('*', async (c, next) => {
    const path = c.req.path; // e.g. /v1/study/...
    const isAiGated = AI_GATED_PREFIXES.some(p => path.includes(p));
    if (!isAiGated) return next();
    // Skip GET reads -- the cap is about WRITES that trigger AI calls.
    // GETs that read cached chapter content don't burn provider tokens.
    // The actual AI generation routes are POSTs.
    if (c.req.method === 'GET') return next();
    try {
      const principal = c.get('principal' as never) as { userId: string } | undefined;
      if (!principal?.userId) return next();
      const user = await users.get(principal.userId as never);
      if (!user) return next();
      const planCap = DEFAULT_DAILY_AI_CAP_USD[user.plan] ?? DEFAULT_DAILY_AI_CAP_USD['free']!;
      const spent = await aiSpend.getTodaySpend(principal.userId as never);
      if (spent >= planCap) {
        logger.warn('ai.daily_cap_hit', { userId: principal.userId, plan: user.plan, spent, cap: planCap, path });
        return c.json({
          error: `You have reached today's AI usage limit on the ${user.plan} plan. Resets at midnight UTC. Upgrade your plan or wait for the reset.`,
          spent: Math.round(spent * 100) / 100,
          cap: planCap,
        }, 429);
      }
    } catch (err) {
      // Cap check failures are non-blocking — we'd rather serve the
      // request than fail-closed on an internal error.
      logger.warn('ai.cap_check_error', { error: err instanceof Error ? err.message : String(err), path });
    }
    return next();
  });
  v1.route('/users', makeUsersRoutes({ users, logger, db: fs, ledger, config, firebaseAuth }));
  v1.route('/assessment', makeAssessmentRoutes({ users, aiEngine, logger, env, ledger, serviceKeys }));
  v1.route('/study', makeStudyRoutes({ users, aiEngine, chapters, logger, db: fs, env, ledger, config, modelResolver }));
  v1.route('/current-affairs', cronRoutes);
  v1.route('/chat', makeChatRoutes({ users, aiEngine, chat: chatStore, logger, env }));
  v1.route('/credits', makeCreditsRoutes({ users, logger, db: fs, ledger, config }));
  v1.route('/billing', makeBillingRoutes({ users, env, logger, db: fs, coupons: couponStore, idempotency, config, serviceKeys }));
  v1.route('/admin', makeAdminRoutes({ users, adminStore, env, logger, coupons: couponStore, db: fs, config, aiSpend, firebaseAuth, blog, aiEngine, aiProviderStore, modelResolver, currentAffairs, serviceKeys, push, teamInvites, emailMarketing }));
  v1.route('/support', makeSupportRoutes({ users, db: fs, logger }));
  v1.route('/essay', makeEssayRoutes({ users, aiEngine, logger, db: fs }));
  v1.route('/mock-tests', makeMockTestRoutes({ users, aiEngine, mockTests, ledger, config, logger }));

  // (POST /v1/logs/error and GET /v1/branding are now mounted on the
  // PUBLIC router via makePublicRoutes() above, so the front-end error
  // boundary and the splash screen can reach them without an ID token.)

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
    // CRITICAL FIX: Hono cors() middleware sets CORS headers on the way in,
    // but onError creates a FRESH response — headers are LOST. Without this,
    // browser sees 503 without Access-Control-Allow-Origin → blocks response
    // → shows "Failed to fetch" instead of the real error message.
    const origin = c.req.header('origin') ?? '';
    if (env.CORS_ALLOWED_ORIGINS.includes(origin)) {
      c.header('Access-Control-Allow-Origin', origin);
      c.header('Access-Control-Allow-Credentials', 'true');
    }
    if (err instanceof HTTPException) { logger.warn('http.error', { status: err.status, message: err.message }); return c.json({ error: err.message }, err.status); }
    logger.error('unhandled', { message: err.message, stack: err.stack });
    adminStore.logError({ id: crypto.randomUUID(), message: err.message, stack: err.stack, route: c.req.path, timestamp: new Date().toISOString(), severity: 'critical' }).catch(() => {});
    return c.json({ error: 'internal server error' }, 500);
  });

  app.notFound((c) => c.json({ error: 'not found' }, 404));
  return app;
}
// API redeploy trigger 1780318400 — force fresh build after PR #239/#241/#243/#244 fixes
