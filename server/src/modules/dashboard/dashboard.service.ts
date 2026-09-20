import type { Priority, TaskStatus } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import type { AuthUser } from '../../middleware/auth';
import { onlineCount } from '../../realtime/presence';
import { taskScope } from '../access/scope';
import { listProjects } from '../projects/projects.service';
import { taskInclude, toTaskDto } from '../tasks/tasks.service';

const STATUSES: TaskStatus[] = ['TODO', 'IN_PROGRESS', 'IN_REVIEW', 'DONE'];
const PRIORITIES: Priority[] = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];

const zeroed = <K extends string>(keys: K[]) => Object.fromEntries(keys.map((k) => [k, 0])) as Record<K, number>;

async function countByStatus(where: object) {
  const groups = await prisma.task.groupBy({ by: ['status'], where, _count: { _all: true } });
  const out = zeroed(STATUSES);
  for (const g of groups) out[g.status] = g._count._all;
  return out;
}

async function countByPriority(where: object) {
  const groups = await prisma.task.groupBy({ by: ['priority'], where, _count: { _all: true } });
  const out = zeroed(PRIORITIES);
  for (const g of groups) out[g.priority] = g._count._all;
  return out;
}

const startOfToday = () => {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
};

export async function getDashboard(user: AuthUser) {
  const scope = taskScope(user);

  if (user.role === 'ADMIN') {
    const [totalProjects, tasksByStatus, overdueTasks, activeUsers] = await Promise.all([
      prisma.project.count(),
      countByStatus({}),
      prisma.task.count({ where: { isOverdue: true } }),
      prisma.user.count({ where: { isActive: true } }),
    ]);
    return {
      role: 'ADMIN' as const,
      totalProjects,
      totalTasks: STATUSES.reduce((n, s) => n + tasksByStatus[s], 0),
      tasksByStatus,
      overdueTasks,
      activeUsers,
      // Initial value only. The UI keeps it live via the `presence:count` socket event.
      onlineNow: onlineCount(),
    };
  }

  if (user.role === 'PROJECT_MANAGER') {
    const weekStart = startOfToday();
    const weekEnd = new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000);
    const open = { AND: [scope, { status: { not: 'DONE' as const } }] };

    const [projects, tasksByStatus, openByPriority, overdueTasks, dueThisWeek] = await Promise.all([
      listProjects(user, {}),
      countByStatus(scope),
      countByPriority(open),
      prisma.task.count({ where: { AND: [scope, { isOverdue: true }] } }),
      prisma.task.findMany({
        where: { AND: [open, { dueDate: { gte: weekStart, lt: weekEnd } }] },
        orderBy: [{ dueDate: 'asc' }, { priority: 'desc' }, { id: 'asc' }],
        take: 25,
        include: taskInclude,
      }),
    ]);
    return {
      role: 'PROJECT_MANAGER' as const,
      projects: projects.data,
      tasksByStatus,
      openTasksByPriority: openByPriority,
      overdueTasks,
      dueThisWeek: dueThisWeek.map(toTaskDto),
    };
  }

  // DEVELOPER
  const [tasksByStatus, overdueTasks, tasks] = await Promise.all([
    countByStatus(scope),
    prisma.task.count({ where: { AND: [scope, { isOverdue: true }] } }),
    prisma.task.findMany({
      where: { AND: [scope, { status: { not: 'DONE' } }] },
      // Priority first (CRITICAL -> LOW), then the soonest due date; tasks without a date last.
      orderBy: [{ priority: 'desc' }, { dueDate: { sort: 'asc', nulls: 'last' } }, { id: 'asc' }],
      take: 50,
      include: taskInclude,
    }),
  ]);
  return {
    role: 'DEVELOPER' as const,
    tasksByStatus,
    overdueTasks,
    assignedTasks: tasks.map(toTaskDto),
  };
}
