export interface Logger {
  info(msg: string, meta?: Record<string, unknown>): void;
  warn(msg: string, meta?: Record<string, unknown>): void;
  error(msg: string, meta?: Record<string, unknown>): void;
}

/**
 * Log level filter for production cost optimization.
 * In production, only warn and error logs are emitted by default.
 * Set LOG_LEVEL=info to restore verbose info-level logging if needed for debugging.
 *
 * Cloud Logging charges per ingested log volume — reducing info-level
 * request logs (which are the bulk of output) cuts logging costs and
 * keeps the signal-to-noise ratio high in production.
 */
type LogLevel = 'info' | 'warn' | 'error';

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = { info: 0, warn: 1, error: 2 };

function getMinLevel(): LogLevel {
  const env = process.env['LOG_LEVEL']?.toLowerCase();
  if (env === 'info' || env === 'warn' || env === 'error') return env;
  // Default: production = warn (suppress noisy per-request info logs),
  // everything else = info (full visibility in dev/test).
  return process.env['NODE_ENV'] === 'production' ? 'warn' : 'info';
}

export function createLogger(service = 'nexigrate-api'): Logger {
  const minLevel = getMinLevel();
  const minPriority = LOG_LEVEL_PRIORITY[minLevel];

  const shouldLog = (level: LogLevel): boolean => LOG_LEVEL_PRIORITY[level] >= minPriority;

  const fmt = (level: string, msg: string, meta?: Record<string, unknown>) =>
    JSON.stringify({ level, service, msg, ts: new Date().toISOString(), ...meta });

  return {
    info: (msg, meta) => { if (shouldLog('info')) console.log(fmt('info', msg, meta)); },
    warn: (msg, meta) => console.warn(fmt('warn', msg, meta)),
    error: (msg, meta) => console.error(fmt('error', msg, meta)),
  };
}
