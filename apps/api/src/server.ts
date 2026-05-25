import { serve } from '@hono/node-server';
import { loadEnv } from './env.js';
import { createLogger } from './logger.js';
import { buildApp } from './app.js';

const env = loadEnv();
const logger = createLogger();
const app = buildApp({ env, logger });

const port = env.PORT;

serve({ fetch: app.fetch, port }, () => {
  logger.info('server.started', { port, env: env.NODE_ENV });
});
