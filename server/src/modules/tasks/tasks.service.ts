import { Prisma, type Priority, type TaskStatus } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { Errors } from '../../lib/errors';
import type { AuthUser } from '../../middleware/auth';
import { publisher } from '../../realtime/publisher';
import { manageableProjectScope, taskScope } from '../access/scope';
import { activityInclude, listActivity, toActivityDto } from '../activity/activity.service';
import { pushNotification } from '../notifications/notifications.service';
import type { CreateTaskInput, TaskQuery, UpdateTaskInput } from './tasks.schemas';

export const taskInclude = {
  project: { select: { id: true, name: true, createdById: true } },
  assignee: { select: { id: true, name: true } },
} satisfies Prisma.TaskInclude;

export type TaskRow = Prisma.TaskGetPayload<{ include: typeof taskInclude }>;

export interface TaskDto {
  id: number;
  title: string;
  description: string;
  status: TaskStatus;
  priority: Priority;
  dueDate: string | null;
  isOverdue: boolean;
  createdAt: string;
  updatedAt: string;
  project: { id: number; name: string };
  assignee: { id: number; name: string } | null;
}

export const toTaskDto = (t: TaskRow): TaskDto => ({
  id: t.id,
  title: t.title,
  description: t.description,
  status: t.status,
  priority: t.priority,
  dueDate: t.dueDate?.toISOString() ?? null,
  isOverdue: t.isOverdue,
  createdAt: t.createdAt.toISOString(),
  updatedAt: t.updatedAt.toISOString(),
  project: { id: t.project.id, name: t.project.name },
  assignee: t.assignee,
});

/** Who gets live events for a task: admins, the project owner and the CURRENT assignee. */
export const audienceFor = (t: Pick<TaskRow, 'assigneeId' | 'project'>) => ({
  userIds: [t.project.createdById, t.assigneeId],
});

const STATUS_LABEL: Record<TaskStatus, string> = {
  TODO: 'To Do',
  IN_PROGRESS: 'In Progress',
  IN_REVIEW: 'In Review',
  DONE: 'Done',
};

async function findAssignableDeveloper(userId: number) {
  const dev = await prisma.user.findFirst({
    where: { id: userId, role: 'DEVELOPER', isActive: true },
    select: { id: true, name: true },
  });
  if (!dev) throw Errors.badRequest('Assignee must be an active developer', [{ path: 'assigneeId', message: 'Invalid developer' }]);
  return dev;
}

// ---------------------------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------------------------

function filtersToWhere(q: TaskQuery): Prisma.TaskWhereInput {
  const where: Prisma.TaskWhereInput = {};
  if (q.status?.length) where.status = { in: q.status };
  if (q.priority?.length) where.priority = { in: q.priority };
  if (q.projectId) where.projectId = q.projectId;
  if (q.assigneeId) where.assigneeId = q.assigneeId;
  if (q.overdue !== undefined) where.isOverdue = q.overdue;
  if (q.dueFrom || q.dueTo) where.dueDate = { ...(q.dueFrom ? { gte: q.dueFrom } : {}), ...(q.dueTo ? { lte: q.dueTo } : {}) };
  if (q.q) where.title = { contains: q.q, mode: 'insensitive' };
  return where;
}

function orderFor(sort: TaskQuery['sort']): Prisma.TaskOrderByWithRelationInput[] {
  const dueAsc: Prisma.TaskOrderByWithRelationInput = { dueDate: { sort: 'asc', nulls: 'last' } };
  switch (sort) {
    case 'dueDate':
      return [dueAsc, { priority: 'desc' }, { id: 'asc' }];
    case 'updatedAt':
      return [{ updatedAt: 'desc' }, { id: 'desc' }];
    case 'createdAt':
      return [{ createdAt: 'desc' }, { id: 'desc' }];
    case 'priority':
    default:
      // Enum declaration order is LOW < MEDIUM < HIGH < CRITICAL, so DESC = most urgent first.
      return [{ priority: 'desc' }, dueAsc, { id: 'asc' }];
  }
}

export async function listTasks(user: AuthUser, q: TaskQuery) {
  const where: Prisma.TaskWhereInput = { AND: [taskScope(user), filtersToWhere(q)] };
  const [total, rows] = await Promise.all([
    prisma.task.count({ where }),
    prisma.task.findMany({
      where,
      orderBy: orderFor(q.sort),
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
      include: taskInclude,
    }),
  ]);
  return {
    data: rows.map(toTaskDto),
    meta: { page: q.page, pageSize: q.pageSize, total, totalPages: Math.max(1, Math.ceil(total / q.pageSize)) },
  };
}

async function findScopedTask(user: AuthUser, id: number): Promise<TaskRow> {
  // Out-of-scope tasks look exactly like missing ones (404), so ids can't be probed.
  const task = await prisma.task.findFirst({ where: { AND: [{ id }, taskScope(user)] }, include: taskInclude });
  if (!task) throw Errors.notFound('Task');
  return task;
}

export async function getTask(user: AuthUser, id: number) {
  const task = await findScopedTask(user, id);
  const history = await listActivity(user, { limit: 50, taskId: id });
  return { ...toTaskDto(task), activity: history.data };
}

// ---------------------------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------------------------

export async function createTask(user: AuthUser, input: CreateTaskInput): Promise<TaskDto> {
  const project = await prisma.project.findFirst({
    where: { AND: [{ id: input.projectId }, manageableProjectScope(user)] },
    select: { id: true, name: true, createdById: true },
  });
  if (!project) throw Errors.notFound('Project');

  const assignee = input.assigneeId ? await findAssignableDeveloper(input.assigneeId) : null;

  const { task, activity, notification } = await prisma.$transaction(async (tx) => {
    const created = await tx.task.create({
      data: {
        projectId: project.id,
        title: input.title,
        description: input.description,
        priority: input.priority,
        dueDate: input.dueDate ?? null,
        assigneeId: assignee?.id ?? null,
        createdById: user.id,
      },
      include: taskInclude,
    });
    const log = await tx.activityLog.create({
      data: {
        type: 'TASK_CREATED',
        taskId: created.id,
        projectId: project.id,
        actorId: user.id,
        toStatus: created.status,
        detail: assignee ? `assigned to ${assignee.name}` : null,
      },
      include: activityInclude,
    });
    const note =
      assignee && assignee.id !== user.id
        ? await tx.notification.create({
            data: {
              userId: assignee.id,
              type: 'TASK_ASSIGNED',
              message: `${user.name} assigned you Task #${created.id}: ${created.title}`,
              taskId: created.id,
              projectId: project.id,
            },
          })
        : null;
    return { task: created, activity: log, notification: note };
  });

  const dto = toTaskDto(task);
  const audience = audienceFor(task);
  publisher.activity(toActivityDto(activity), audience);
  publisher.taskChanged({ action: 'created', task: dto }, audience);
  if (notification) await pushNotification(notification);
  return dto;
}

interface Changes {
  title?: string;
  description?: string;
  priority?: Priority;
  dueDate?: Date | null;
  status?: TaskStatus;
  assigneeId?: number | null;
}

/**
 * The single write path for tasks. Task update + activity log rows + notifications commit in ONE
 * transaction (so the log can never disagree with the task), and realtime events are published
 * only after the commit succeeded.
 */
async function applyChanges(actor: AuthUser, existing: TaskRow, changes: Changes): Promise<TaskDto> {
  const data: Prisma.TaskUncheckedUpdateInput = {};
  if (changes.title !== undefined && changes.title !== existing.title) data.title = changes.title;
  if (changes.description !== undefined && changes.description !== existing.description) data.description = changes.description;
  if (changes.priority !== undefined && changes.priority !== existing.priority) data.priority = changes.priority;

  const statusChanged = changes.status !== undefined && changes.status !== existing.status;
  if (statusChanged) {
    data.status = changes.status;
    if (changes.status === 'DONE') data.isOverdue = false; // finished work is no longer overdue
  }

  if (changes.dueDate !== undefined && changes.dueDate?.getTime() !== existing.dueDate?.getTime()) {
    data.dueDate = changes.dueDate;
    // A pushed-out (or removed) due date clears the flag now; the scheduler re-flags if it lapses again.
    if (changes.dueDate === null || changes.dueDate.getTime() > Date.now()) data.isOverdue = false;
  }

  const assigneeChanged = changes.assigneeId !== undefined && changes.assigneeId !== existing.assigneeId;
  const newAssignee = assigneeChanged && changes.assigneeId != null ? await findAssignableDeveloper(changes.assigneeId) : null;
  if (assigneeChanged) data.assigneeId = changes.assigneeId ?? null;

  if (Object.keys(data).length === 0) return toTaskDto(existing);

  const result = await prisma.$transaction(async (tx) => {
    const updated = await tx.task.update({ where: { id: existing.id }, data, include: taskInclude });

    const activities = [];
    if (statusChanged) {
      activities.push(
        await tx.activityLog.create({
          data: {
            type: 'STATUS_CHANGED',
            taskId: existing.id,
            projectId: existing.projectId,
            actorId: actor.id,
            fromStatus: existing.status,
            toStatus: changes.status!,
          },
          include: activityInclude,
        }),
      );
    }
    if (assigneeChanged) {
      activities.push(
        await tx.activityLog.create({
          data: {
            type: 'ASSIGNEE_CHANGED',
            taskId: existing.id,
            projectId: existing.projectId,
            actorId: actor.id,
            detail: newAssignee ? `assigned to ${newAssignee.name}` : 'unassigned',
          },
          include: activityInclude,
        }),
      );
    }

    const notifications = [];
    if (newAssignee && newAssignee.id !== actor.id) {
      notifications.push(
        await tx.notification.create({
          data: {
            userId: newAssignee.id,
            type: 'TASK_ASSIGNED',
            message: `${actor.name} assigned you Task #${existing.id}: ${updated.title}`,
            taskId: existing.id,
            projectId: existing.projectId,
          },
        }),
      );
    }
    const pmId = existing.project.createdById;
    if (statusChanged && changes.status === 'IN_REVIEW' && pmId !== actor.id) {
      notifications.push(
        await tx.notification.create({
          data: {
            userId: pmId,
            type: 'TASK_IN_REVIEW',
            message: `${actor.name} moved Task #${existing.id} to ${STATUS_LABEL.IN_REVIEW}: ${updated.title}`,
            taskId: existing.id,
            projectId: existing.projectId,
          },
        }),
      );
    }
    return { updated, activities, notifications };
  });

  // ---- committed: now tell the right people, live ----
  const dto = toTaskDto(result.updated);
  const audience = audienceFor(result.updated);
  for (const a of result.activities) publisher.activity(toActivityDto(a), audience);
  publisher.taskChanged({ action: 'updated', task: dto }, audience);
  if (assigneeChanged && existing.assigneeId && existing.assigneeId !== result.updated.assigneeId) {
    // The previous assignee just lost access to this task: remove it from their screen.
    publisher.taskRemovedFrom(existing.assigneeId, existing.id, existing.projectId);
  }
  for (const n of result.notifications) await pushNotification(n);

  return dto;
}

/** Admin / PM: edit any field of a task in a project they manage. */
export async function updateTask(user: AuthUser, id: number, input: UpdateTaskInput): Promise<TaskDto> {
  const existing = await findScopedTask(user, id);
  return applyChanges(user, existing, input);
}

/** Everyone with access to the task (incl. its developer) may move it between columns. */
export async function updateTaskStatus(user: AuthUser, id: number, status: TaskStatus): Promise<TaskDto> {
  const existing = await findScopedTask(user, id);
  return applyChanges(user, existing, { status });
}

export async function deleteTask(user: AuthUser, id: number): Promise<void> {
  const existing = await findScopedTask(user, id);
  await prisma.task.delete({ where: { id } });
  publisher.taskChanged(
    { action: 'removed', taskId: existing.id, projectId: existing.projectId },
    audienceFor(existing),
  );
}
