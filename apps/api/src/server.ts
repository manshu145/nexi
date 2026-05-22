import { serve } from '@hono/node-server';
import { buildApp } from './app.js';
import { loadEnv } from './env.js';
import { makeLogger } from './logger.js';

/**
 * Composition root. Loads env, builds the app, starts the HTTP server.
 *
 * Cloud Run invokes this entry point with PORT set to whatever it allocates
 * (usually 8080). Locally, defaults to PORT=8080 with AUTH_MODE=stub so a
 * fresh checkout boots without any external configuration.
 */
async function main(): Promise<void> {
  const env = loadEnv();
  const logger = makeLogger(env);
  const app = buildApp({ env, logger });

  serve({ fetch: app.fetch, port: env.PORT }, (info) => {
    logger.info('server.listen', {
      port: info.port,
      env: env.NODE_ENV,
      authMode: env.AUTH_MODE,
    });
  });

  // Graceful shutdown for Cloud Run (it sends SIGTERM ~10s before killing the container).
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.on(signal, () => {
      logger.info('server.shutdown', { signal });
      process.exit(0);
    });
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Fatal startup error:', err);
  process.exit(1);
});
