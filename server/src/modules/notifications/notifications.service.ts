import type { NotificationType, Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { Errors } from '../../lib/errors';
import type { AuthUser } from '../../middleware/auth';
import { publisher } from '../../realtime/publisher';

export interface NotificationDto {
  id: number;
  type: NotificationType;
  message: string;
  taskId: number | null;
  projectId: number | null;
  read: boolean;
  createdAt: string;
}

type Row = Prisma.NotificationGetPayload<Record<string, never>>;

export const toNotificationDto = (n: Row): NotificationDto => ({
  id: n.id,
  type: n.type,
  message: n.message,
  taskId: n.taskId,
  projectId: n.projectId,
  read: n.readAt !== null,
  createdAt: n.createdAt.toISOString(),
});

export const countUnread = (userId: number) => prisma.notification.count({ where: { userId, readAt: null } });

export async function listNotifications(user: AuthUser, limit: number) {
  const [rows, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where: { userId: user.id },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit,
    }),
    countUnread(user.id),
  ]);
  return { data: rows.map(toNotificationDto), unreadCount };
}

export async function markRead(user: AuthUser, id: number) {
  // userId in the WHERE clause = you can only ever touch your own notifications
  const result = await prisma.notification.updateMany({
    where: { id, userId: user.id, readAt: null },
    data: { readAt: new Date() },
  });
  const exists = result.count > 0 || (await prisma.notification.count({ where: { id, userId: user.id } })) > 0;
  if (!exists) throw Errors.notFound('Notification');
  const unreadCount = await countUnread(user.id);
  publisher.unreadCount(user.id, unreadCount); // keeps other open tabs in sync
  return { unreadCount };
}

export async function markAllRead(user: AuthUser) {
  await prisma.notification.updateMany({ where: { userId: user.id, readAt: null }, data: { readAt: new Date() } });
  publisher.unreadCount(user.id, 0);
  return { unreadCount: 0 };
}

/** Called after a transaction has committed: push the new notification + fresh badge count. */
export async function pushNotification(row: Row): Promise<void> {
  const unreadCount = await countUnread(row.userId);
  publisher.notification(row.userId, toNotificationDto(row), unreadCount);
}
