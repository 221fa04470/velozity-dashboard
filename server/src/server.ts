import http from 'node:http';
import { createApp } from './app';
import { env } from './config/env';
import { startJobs } from './jobs/overdue.job';
import { logger } from './lib/logger';
import { prisma } from './lib/prisma';
import { createSocketServer } from './realtime/socket';

async function main() {
  const app = createApp();
  const server = http.createServer(app);
  const io = createSocketServer(server);

  await prisma.$connect();
  server.listen(env.PORT, () => {
    logger.info(`API listening on :${env.PORT}`, { env: env.NODE_ENV });
    startJobs();
  });

  const shutdown = (signal: string) => {
    logger.info(`${signal} received, shutting down`);
    io.close(() => {
      server.close(async () => {
        await prisma.$disconnect();
        process.exit(0);
      });
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err) => {
  logger.error('Failed to start server', { message: String(err), stack: err instanceof Error ? err.stack : undefined });
  process.exit(1);
});
