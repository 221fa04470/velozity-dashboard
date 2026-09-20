import { Prisma, type TaskStatus } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { Errors } from '../../lib/errors';
import type { AuthUser } from '../../middleware/auth';
import { manageableProjectScope, projectScope, taskScope } from '../access/scope';

const projectInclude = {
  client: { select: { id: true, name: true } },
  createdBy: { select: { id: true, name: true } },
} satisfies Prisma.ProjectInclude;

type ProjectRow = Prisma.ProjectGetPayload<{ include: typeof projectInclude }>;

const STATUSES: TaskStatus[] = ['TODO', 'IN_PROGRESS', 'IN_REVIEW', 'DONE'];

export interface ProjectDto {
  id: number;
  name: string;
  description: string;
  client: { id: number; name: string };
  createdBy: { id: number; name: string };
  createdAt: string;
  /** Counts only include tasks the requesting user is allowed to see (a developer sees their own). */
  taskCounts: Record<TaskStatus, number>;
  totalTasks: number;
  overdueTasks: number;
}

async function toDtos(user: AuthUser, rows: ProjectRow[]): Promise<ProjectDto[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const scoped = (extra: Prisma.TaskWhereInput = {}): Prisma.TaskWhereInput => ({
    AND: [{ projectId: { in: ids } }, taskScope(user), extra],
  });

  const [byStatus, overdue] = await Promise.all([
    prisma.task.groupBy({ by: ['projectId', 'status'], where: scoped(), _count: { _all: true } }),
    prisma.task.groupBy({ by: ['projectId'], where: scoped({ isOverdue: true }), _count: { _all: true } }),
  ]);

  return rows.map((p) => {
    const taskCounts = Object.fromEntries(STATUSES.map((s) => [s, 0])) as Record<TaskStatus, number>;
    for (const g of byStatus) if (g.projectId === p.id) taskCounts[g.status] = g._count._all;
    return {
      id: p.id,
      name: p.name,
      description: p.description,
      client: p.client,
      createdBy: p.createdBy,
      createdAt: p.createdAt.toISOString(),
      taskCounts,
      totalTasks: STATUSES.reduce((sum, s) => sum + taskCounts[s], 0),
      overdueTasks: overdue.find((o) => o.projectId === p.id)?._count._all ?? 0,
    };
  });
}

export async function listProjects(user: AuthUser, q: { clientId?: number; q?: string }) {
  const rows = await prisma.project.findMany({
    where: {
      AND: [
        projectScope(user),
        ...(q.clientId ? [{ clientId: q.clientId }] : []),
        ...(q.q ? [{ name: { contains: q.q, mode: 'insensitive' as const } }] : []),
      ],
    },
    orderBy: { createdAt: 'desc' },
    include: projectInclude,
  });
  return { data: await toDtos(user, rows) };
}

export async function getProject(user: AuthUser, id: number): Promise<ProjectDto> {
  const row = await prisma.project.findFirst({ where: { AND: [{ id }, projectScope(user)] }, include: projectInclude });
  if (!row) throw Errors.notFound('Project');
  return (await toDtos(user, [row]))[0]!;
}

async function assertClient(clientId: number) {
  const client = await prisma.client.findUnique({ where: { id: clientId }, select: { id: true } });
  if (!client) throw Errors.badRequest('Client does not exist', [{ path: 'clientId', message: 'Unknown client' }]);
}

async function assertOwner(userId: number) {
  const owner = await prisma.user.findFirst({
    where: { id: userId, isActive: true, role: { in: ['ADMIN', 'PROJECT_MANAGER'] } },
    select: { id: true },
  });
  if (!owner) throw Errors.badRequest('Owner must be an active admin or project manager', [{ path: 'createdById', message: 'Invalid owner' }]);
}

export async function createProject(
  user: AuthUser,
  input: { name: string; description: string; clientId: number; createdById?: number },
) {
  await assertClient(input.clientId);
  let ownerId = user.id;
  if (user.role === 'ADMIN' && input.createdById) {
    await assertOwner(input.createdById);
    ownerId = input.createdById;
  }
  const row = await prisma.project.create({
    data: { name: input.name, description: input.description, clientId: input.clientId, createdById: ownerId },
    include: projectInclude,
  });
  return (await toDtos(user, [row]))[0]!;
}

export async function updateProject(
  user: AuthUser,
  id: number,
  input: { name?: string; description?: string; clientId?: number; createdById?: number },
) {
  const existing = await prisma.project.findFirst({ where: { AND: [{ id }, manageableProjectScope(user)] }, select: { id: true } });
  if (!existing) throw Errors.notFound('Project');
  if (input.clientId) await assertClient(input.clientId);

  const data: Prisma.ProjectUncheckedUpdateInput = {};
  if (input.name !== undefined) data.name = input.name;
  if (input.description !== undefined) data.description = input.description;
  if (input.clientId !== undefined) data.clientId = input.clientId;
  if (input.createdById !== undefined) {
    if (user.role !== 'ADMIN') throw Errors.forbidden('Only admins can change a project owner');
    await assertOwner(input.createdById);
    data.createdById = input.createdById;
  }

  const row = await prisma.project.update({ where: { id }, data, include: projectInclude });
  return (await toDtos(user, [row]))[0]!;
}

export async function deleteProject(user: AuthUser, id: number) {
  const existing = await prisma.project.findFirst({ where: { AND: [{ id }, manageableProjectScope(user)] }, select: { id: true } });
  if (!existing) throw Errors.notFound('Project');
  await prisma.project.delete({ where: { id } }); // tasks + activity cascade
}
