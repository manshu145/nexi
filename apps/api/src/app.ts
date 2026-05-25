import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { HTTPException } from 'hono/http-exception';
import type { Env } from './env.js';
import { getFirebaseAuth, getFirebaseFirestore } from './lib/firebaseAdmin.js';
import { FirestoreUserStore, InMemoryUserStore, type UserStore } from './lib/userStore.js';
import { createAIEngine, type AIEngine } from './lib/aiEngine.js';
import { InMemoryChapterStore, FirestoreChapterStore, type ChapterStore } from './lib/chapterStore.js';
import { InMemoryCurrentAffairsStore, FirestoreCurrentAffairsStore, type CurrentAffairsStore } from './lib/currentAffairsStore.js';
import { authMiddleware } from './auth.js';
import type { Logger } from './logger.js';
import { makeHealthRoutes, makeDiagRoutes } from './routes/health.js';
import { makeUsersRoutes } from './routes/users.js';
import { makeAssessmentRoutes } from './routes/assessment.js';
import { makeStudyRoutes } from './routes/study.js';
import { makeCurrentAffairsRoutes } from './routes/currentAffairs.js';

export interface AppDeps { env: Env; logger: Logger; users?: UserStore; aiEngine?: AIEngine; chapters?: ChapterStore; currentAffairs?: CurrentAffairsStore; }

export function buildApp(deps: AppDeps): Hono {
  const { env, logger } = deps;
  const useFirestore = env.PERSISTENCE === 'firestore';
  const fs = useFirestore ? getFirebaseFirestore(env) : null;
  const users = deps.users ?? (fs ? new FirestoreUserStore(fs) : new InMemoryUserStore());
  const aiEngine = deps.aiEngine ?? createAIEngine(env, logger);
  const chapters = deps.chapters ?? (fs ? new FirestoreChapterStore(fs) : new InMemoryChapterStore());
  const currentAffairs = deps.currentAffairs ?? (fs ? new FirestoreCurrentAffairsStore(fs) : new InMemoryCurrentAffairsStore());
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

  app.route('/', makeHealthRoutes());
  app.route('/', makeDiagRoutes(env));
  app.get('/', (c) => c.json({ service: 'nexigrate-api', version: '1.0.0' }));

  // Cron endpoint — NO auth required (uses x-cron-secret header instead)
  const cronRoutes = makeCurrentAffairsRoutes({ users, aiEngine, currentAffairs, env, logger });
  app.post('/v1/current-affairs/ingest', async (c) => {
    const cronSecret = c.req.header('x-cron-secret');
    if (cronSecret !== 'nexigrate-cron-2026') {
      return c.json({ error: 'unauthorized' }, 401);
    }
    const { ingestCurrentAffairs } = await import('./lib/rssIngestion.js');
    const result = await ingestCurrentAffairs(currentAffairs, env, logger);
    return c.json({ success: true, ...result });
  });

  const v1 = new Hono();
  v1.use('*', authMiddleware(firebaseAuth));
  v1.route('/users', makeUsersRoutes({ users, logger }));
  v1.route('/assessment', makeAssessmentRoutes({ users, aiEngine, logger }));
  v1.route('/study', makeStudyRoutes({ users, aiEngine, chapters, logger }));
  v1.route('/current-affairs', cronRoutes);
  app.route('/v1', v1);

  app.onError((err, c) => {
    if (err instanceof HTTPException) { logger.warn('http.error', { status: err.status, message: err.message }); return c.json({ error: err.message }, err.status); }
    logger.error('unhandled', { message: err.message, stack: err.stack });
    return c.json({ error: 'internal server error' }, 500);
  });

  app.notFound((c) => c.json({ error: 'not found' }, 404));
  return app;
}
