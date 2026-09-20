import type http from 'node:http';
import { Server, type Socket } from 'socket.io';
import { env } from '../config/env';
import { logger } from '../lib/logger';
import { prisma } from '../lib/prisma';
import { loadUserFromToken, type AuthUser } from '../middleware/auth';
import { addConnection, onlineCount, removeConnection } from './presence';
import { ADMIN_ROOM, publisher, setSocketServer, userRoom } from './publisher';

interface SocketData {
  user: AuthUser;
  expiryTimer?: NodeJS.Timeout;
}

const dataOf = (socket: Socket) => socket.data as SocketData;

/** Disconnect the socket when its access token expires so a revoked/expired session can't stay live forever. */
function scheduleExpiry(socket: Socket, expSeconds: number) {
  const data = dataOf(socket);
  if (data.expiryTimer) clearTimeout(data.expiryTimer);
  const ms = Math.max(0, expSeconds * 1000 - Date.now());
  data.expiryTimer = setTimeout(() => {
    socket.emit('auth:expired');
    socket.disconnect(true);
  }, ms);
}

export function createSocketServer(httpServer: http.Server): Server {
  const io = new Server(httpServer, {
    cors: { origin: env.corsOrigins, credentials: true },
    // WebSocket only. No long-polling fallback, by requirement and by choice.
    transports: ['websocket'],
    serveClient: false,
  });
  setSocketServer(io);

  // Handshake auth: same JWT + same DB-backed user check as the REST API.
  io.use(async (socket, next) => {
    try {
      const token = (socket.handshake.auth as { token?: unknown } | undefined)?.token;
      if (typeof token !== 'string' || !token) return next(new Error('UNAUTHORIZED'));
      const { user, exp } = await loadUserFromToken(token);
      const data = dataOf(socket);
      data.user = user;
      scheduleExpiry(socket, exp);
      next();
    } catch {
      next(new Error('UNAUTHORIZED'));
    }
  });

  io.on('connection', (socket) => {
    const { user } = dataOf(socket);

    // Private room per user. Admins also join the shared admin room.
    void socket.join(userRoom(user.id));
    if (user.role === 'ADMIN') void socket.join(ADMIN_ROOM);

    const before = onlineCount();
    addConnection(user.id);
    if (onlineCount() !== before) publisher.presence(onlineCount());
    if (user.role === 'ADMIN') socket.emit('presence:count', { online: onlineCount() });

    // The client calls this after each silent token refresh so long-lived sockets stay authorised.
    socket.on('auth:refresh', async (token: unknown, ack?: (ok: boolean) => void) => {
      try {
        if (typeof token !== 'string') throw new Error('bad token');
        const { user: refreshed, exp } = await loadUserFromToken(token);
        if (refreshed.id !== user.id) throw new Error('user mismatch');
        scheduleExpiry(socket, exp);
        ack?.(true);
      } catch {
        ack?.(false);
        socket.disconnect(true);
      }
    });

    socket.on('disconnect', () => {
      const data = dataOf(socket);
      if (data.expiryTimer) clearTimeout(data.expiryTimer);
      const wasLast = removeConnection(user.id);
      if (wasLast) {
        publisher.presence(onlineCount());
        // Remember when they left: this timestamp drives the "events you missed" catch-up on return.
        prisma.user
          .update({ where: { id: user.id }, data: { lastSeenAt: new Date() } })
          .catch((err) => logger.warn('Failed to store lastSeenAt', { message: String(err) }));
      }
    });
  });

  return io;
}
