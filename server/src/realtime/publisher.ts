import type { Server } from 'socket.io';
import type { ActivityDto } from '../modules/activity/activity.service';
import type { TaskDto } from '../modules/tasks/tasks.service';
import type { NotificationDto } from '../modules/notifications/notifications.service';

/**
 * The only place services talk to Socket.io. Services never import the socket server directly, so
 * domain code stays testable and the delivery rules live in one file.
 *
 * Delivery model: no shared "project rooms". Each socket joins a private room per user
 * (`user:<id>`) and admins also join `admins`. For every event the server works out exactly who is
 * allowed to see it (same rules as realtime scope in modules/access/scope.ts) and emits to those
 * rooms only. A developer's socket is therefore never even sent events for tasks that are not theirs.
 */

export const ADMIN_ROOM = 'admins';
export const userRoom = (id: number) => `user:${id}`;

let io: Server | null = null;

export function setSocketServer(server: Server): void {
  io = server;
}

export interface Audience {
  /** Project owner + current assignee. Admins are always included on top of these. */
  userIds: Array<number | null | undefined>;
}

const clean = (ids: Array<number | null | undefined>): number[] => [
  ...new Set(ids.filter((id): id is number => typeof id === 'number')),
];

export type TaskChangedEvent =
  | { action: 'created' | 'updated'; task: TaskDto }
  | { action: 'removed'; taskId: number; projectId: number };

export const publisher = {
  /** Admins + the listed users. */
  toAudience(event: string, payload: unknown, audience: Audience): void {
    io?.to([ADMIN_ROOM, ...clean(audience.userIds).map(userRoom)]).emit(event, payload);
  },

  /** Only the listed users (no admins). */
  toUsers(event: string, payload: unknown, userIds: Array<number | null | undefined>): void {
    const rooms = clean(userIds).map(userRoom);
    if (rooms.length) io?.to(rooms).emit(event, payload);
  },

  activity(activity: ActivityDto, audience: Audience): void {
    this.toAudience('activity:new', activity, audience);
  },

  taskChanged(event: TaskChangedEvent, audience: Audience): void {
    this.toAudience('task:changed', event, audience);
  },

  /** Used when a task leaves a developer's scope (reassigned) so it disappears from their UI. */
  taskRemovedFrom(userId: number, taskId: number, projectId: number): void {
    this.toUsers('task:changed', { action: 'removed', taskId, projectId } satisfies TaskChangedEvent, [userId]);
  },

  notification(userId: number, notification: NotificationDto, unreadCount: number): void {
    this.toUsers('notification:new', { notification, unreadCount }, [userId]);
  },

  unreadCount(userId: number, unreadCount: number): void {
    this.toUsers('notification:count', { unreadCount }, [userId]);
  },

  presence(online: number): void {
    io?.to(ADMIN_ROOM).emit('presence:count', { online });
  },
};
