export interface Logger {
  info(msg: string, meta?: Record<string, unknown>): void;
  warn(msg: string, meta?: Record<string, unknown>): void;
  error(msg: string, meta?: Record<string, unknown>): void;
}

export function createLogger(service = 'nexigrate-api'): Logger {
  const fmt = (level: string, msg: string, meta?: Record<string, unknown>) => {
    const entry = {
      level,
      service,
      msg,
      ts: new Date().toISOString(),
      ...meta,
    };
    return JSON.stringify(entry);
  };

  return {
    info: (msg, meta) => console.log(fmt('info', msg, meta)),
    warn: (msg, meta) => console.warn(fmt('warn', msg, meta)),
    error: (msg, meta) => console.error(fmt('error', msg, meta)),
  };
}
