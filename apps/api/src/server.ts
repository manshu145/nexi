import { serve } from '@hono/node-server';
import { loadEnv } from './env.js';
import { createLogger } from './logger.js';
import { buildApp } from './app.js';

const env = loadEnv();
const logger = createLogger();
const app = buildApp({ env, logger });

serve({ fetch: app.fetch, port: env.PORT }, () => {
  logger.info('server.started', { port: env.PORT, env: env.NODE_ENV });
});
