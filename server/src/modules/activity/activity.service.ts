import { Prisma, type ActivityType, type TaskStatus } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import type { AuthUser } from '../../middleware/auth';
import { activityScope } from '../access/scope';

export const activityInclude = {
  actor: { select: { id: true, name: true } },
  task: { select: { id: true, title: true, assigneeId: true } },
  project: { select: { id: true, name: true, createdById: true } },
} satisfies Prisma.ActivityLogInclude;

export type ActivityRow = Prisma.ActivityLogGetPayload<{ include: typeof activityInclude }>;

export interface ActivityDto {
  id: number;
  type: ActivityType;
  createdAt: string;
  /** null = the system (e.g. overdue scheduler) */
  actor: { id: number; name: string } | null;
  task: { id: number; title: string };
  project: { id: number; name: string };
  fromStatus: TaskStatus | null;
  toStatus: TaskStatus | null;
  detail: string | null;
}

export const toActivityDto = (row: ActivityRow): ActivityDto => ({
  id: row.id,
  type: row.type,
  createdAt: row.createdAt.toISOString(),
  actor: row.actor,
  task: { id: row.task.id, title: row.task.title },
  project: { id: row.project.id, name: row.project.name },
  fromStatus: row.fromStatus,
  toStatus: row.toStatus,
  detail: row.detail,
});

const MISSED_LIMIT = 20;

export interface ListActivityQuery {
  limit: number;
  before?: number;
  projectId?: number;
  taskId?: number;
}

/** Role-scoped feed straight from the database, newest first, cursor paginated. */
export async function listActivity(user: AuthUser, q: ListActivityQuery) {
  const rows = await prisma.activityLog.findMany({
    where: {
      AND: [
        activityScope(user),
        ...(q.projectId ? [{ projectId: q.projectId }] : []),
        ...(q.taskId ? [{ taskId: q.taskId }] : []),
      ],
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: q.limit + 1,
    // `before` is exclusive, so skip the cursor row itself.
    ...(q.before ? { cursor: { id: q.before }, skip: 1 } : {}),
    include: activityInclude,
  });

  const hasMore = rows.length > q.limit;
  const data = rows.slice(0, q.limit).map(toActivityDto);
  return { data, nextCursor: hasMore ? data[data.length - 1]?.id ?? null : null };
}

/**
 * "What did I miss while I was offline?" Everything visible to this user that happened after
 * their last live connection ended, excluding their own actions. Read from Postgres every time.
 * Returns the 20 most recent plus the total so the UI can say "and 14 more".
 */
export async function getMissedActivity(user: AuthUser) {
  const me = await prisma.user.findUnique({ where: { id: user.id }, select: { lastSeenAt: true } });
  const since = me?.lastSeenAt ?? null;
  if (!since) return { since: null, total: 0, events: [] as ActivityDto[] };

  const where: Prisma.ActivityLogWhereInput = {
    AND: [activityScope(user), { createdAt: { gt: since } }, { OR: [{ actorId: null }, { actorId: { not: user.id } }] }],
  };

  const [total, rows] = await Promise.all([
    prisma.activityLog.count({ where }),
    prisma.activityLog.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: MISSED_LIMIT,
      include: activityInclude,
    }),
  ]);

  return { since: since.toISOString(), total, events: rows.map(toActivityDto) };
}

export async function markActivitySeen(user: AuthUser): Promise<void> {
  await prisma.user.update({ where: { id: user.id }, data: { lastSeenAt: new Date() } });
}
