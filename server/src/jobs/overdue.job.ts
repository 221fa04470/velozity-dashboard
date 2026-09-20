import cron from 'node-cron';
import { env } from '../config/env';
import { logger } from '../lib/logger';
import { prisma } from '../lib/prisma';
import { activityInclude, toActivityDto } from '../modules/activity/activity.service';
import { purgeExpiredRefreshTokens } from '../modules/auth/auth.service';
import { audienceFor, taskInclude, toTaskDto } from '../modules/tasks/tasks.service';
import { publisher } from '../realtime/publisher';

const BATCH = 200;

/**
 * Flags every task whose due date has passed (and is not Done) as overdue.
 * Idempotent: only rows with isOverdue = false are touched, so running it twice (or on two
 * instances at once) can't double-flag or double-log.
 * Each newly overdue task gets a TASK_OVERDUE row in the activity log and a live event.
 */
export async function flagOverdueTasks(now = new Date()): Promise<number> {
  let flagged = 0;

  // Loop in batches so a huge backlog never becomes one giant transaction.
  for (;;) {
    const due = await prisma.task.findMany({
      where: { dueDate: { lt: now }, status: { not: 'DONE' }, isOverdue: false },
      select: { id: true, projectId: true },
      orderBy: { id: 'asc' },
      take: BATCH,
    });
    if (due.length === 0) break;

    const ids = due.map((t) => t.id);
    const claimed = await prisma.$transaction(async (tx) => {
      // Re-check isOverdue inside the transaction: only the run that flips the flag logs it.
      const fresh = await tx.task.findMany({ where: { id: { in: ids }, isOverdue: false }, select: { id: true, projectId: true } });
      if (fresh.length === 0) return [];
      await tx.task.updateMany({ where: { id: { in: fresh.map((t) => t.id) } }, data: { isOverdue: true } });
      const logs = [];
      for (const t of fresh) {
        logs.push(
          await tx.activityLog.create({
            data: { type: 'TASK_OVERDUE', taskId: t.id, projectId: t.projectId, actorId: null },
            include: activityInclude,
          }),
        );
      }
      return logs;
    });
    if (claimed.length === 0) break;
    flagged += claimed.length;

    // Publish after commit.
    const tasks = await prisma.task.findMany({ where: { id: { in: claimed.map((l) => l.taskId) } }, include: taskInclude });
    for (const task of tasks) {
      const audience = audienceFor(task);
      publisher.taskChanged({ action: 'updated', task: toTaskDto(task) }, audience);
      const log = claimed.find((l) => l.taskId === task.id);
      if (log) publisher.activity(toActivityDto(log), audience);
    }

    if (due.length < BATCH) break;
  }

  return flagged;
}

export function startJobs(): void {
  // node-cron instead of Bull: one small in-process scheduler, no Redis to provision. The job is
  // idempotent so a missed or duplicated tick is harmless. See README for the trade-offs.
  cron.schedule(env.OVERDUE_CRON, () => {
    flagOverdueTasks()
      .then((n) => n > 0 && logger.info('Overdue scan flagged tasks', { count: n }))
      .catch((err) => logger.error('Overdue scan failed', { message: String(err) }));
  });

  // Daily housekeeping: drop expired refresh tokens.
  cron.schedule('0 3 * * *', () => {
    purgeExpiredRefreshTokens().catch((err) => logger.error('Token purge failed', { message: String(err) }));
  });

  // Catch up immediately on boot (covers downtime longer than one cron interval).
  flagOverdueTasks()
    .then((n) => n > 0 && logger.info('Startup overdue scan flagged tasks', { count: n }))
    .catch((err) => logger.error('Startup overdue scan failed', { message: String(err) }));

  logger.info('Background jobs scheduled', { overdueCron: env.OVERDUE_CRON });
}
