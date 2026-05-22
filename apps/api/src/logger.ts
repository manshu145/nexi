import type { Env } from './env.js';

/**
 * Tiny structured logger.
 *
 * Production writes single-line JSON for Cloud Logging to ingest natively.
 * Development writes human-readable lines. Trace levels: debug, info, warn, error.
 *
 * We don't pull in pino/winston here because the API is intentionally lean and
 * Cloud Logging needs nothing beyond JSON-on-stdout; the value of a heavy
 * logger doesn't pay off until the codebase is much larger.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_RANK: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

export interface Logger {
  debug(msg: string, ctx?: Record<string, unknown>): void;
  info(msg: string, ctx?: Record<string, unknown>): void;
  warn(msg: string, ctx?: Record<string, unknown>): void;
  error(msg: string, ctx?: Record<string, unknown>): void;
  child(bindings: Record<string, unknown>): Logger;
}

export function makeLogger(env: Pick<Env, 'LOG_JSON' | 'NODE_ENV'>): Logger {
  const minLevel: LogLevel = env.NODE_ENV === 'production' ? 'info' : 'debug';
  const minRank = LEVEL_RANK[minLevel];

  function emit(level: LogLevel, msg: string, ctx: Record<string, unknown> = {}, bindings: Record<string, unknown> = {}): void {
    if (LEVEL_RANK[level] < minRank) return;
    if (env.LOG_JSON) {
      const line = JSON.stringify({
        ts: new Date().toISOString(),
        level,
        msg,
        ...bindings,
        ...ctx,
      });
      // eslint-disable-next-line no-console
      console.log(line);
    } else {
      const tag = level.toUpperCase().padEnd(5);
      const ctxStr = Object.keys(ctx).length > 0 ? ` ${JSON.stringify(ctx)}` : '';
      const bindStr = Object.keys(bindings).length > 0 ? ` ${JSON.stringify(bindings)}` : '';
      // eslint-disable-next-line no-console
      console.log(`[${tag}] ${msg}${bindStr}${ctxStr}`);
    }
  }

  function build(bindings: Record<string, unknown>): Logger {
    return {
      debug: (m, c) => emit('debug', m, c, bindings),
      info: (m, c) => emit('info', m, c, bindings),
      warn: (m, c) => emit('warn', m, c, bindings),
      error: (m, c) => emit('error', m, c, bindings),
      child: (extra) => build({ ...bindings, ...extra }),
    };
  }

  return build({});
}
