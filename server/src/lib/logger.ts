type Level = 'info' | 'warn' | 'error';

function write(level: Level, message: string, meta?: unknown) {
  const line = { level, time: new Date().toISOString(), message, ...(meta ? { meta } : {}) };
  const out = level === 'error' ? console.error : console.log;
  out(JSON.stringify(line));
}

export const logger = {
  info: (message: string, meta?: unknown) => write('info', message, meta),
  warn: (message: string, meta?: unknown) => write('warn', message, meta),
  error: (message: string, meta?: unknown) => write('error', message, meta),
};
