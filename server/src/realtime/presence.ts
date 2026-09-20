/**
 * In-memory presence: userId -> number of open sockets (a user with 3 tabs counts once).
 * Presence is intentionally ephemeral. It describes who is connected to THIS process right now.
 * (Scaling out to several instances would need the Socket.io Redis adapter; see README.)
 */
const connections = new Map<number, number>();

export function addConnection(userId: number): void {
  connections.set(userId, (connections.get(userId) ?? 0) + 1);
}

/** Returns true when that was the user's last open socket. */
export function removeConnection(userId: number): boolean {
  const next = (connections.get(userId) ?? 1) - 1;
  if (next <= 0) {
    connections.delete(userId);
    return true;
  }
  connections.set(userId, next);
  return false;
}

export const onlineCount = (): number => connections.size;
