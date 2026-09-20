import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { io, type Socket } from 'socket.io-client';
import { getAccessToken, onTokenChange, refreshSession } from '../api/client';
import { useAuth } from '../auth/AuthContext';

const SOCKET_URL = (import.meta.env.VITE_SOCKET_URL as string | undefined) ?? 'http://localhost:4000';

interface SocketState {
  socket: Socket | null;
  connected: boolean;
  /** Admins only: users online right now (from WebSocket presence). */
  online: number | null;
}

const SocketContext = createContext<SocketState>({ socket: null, connected: false, online: null });

export function SocketProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [state, setState] = useState<SocketState>({ socket: null, connected: false, online: null });
  const hasConnected = useRef(false);

  const userId = user?.id;
  useEffect(() => {
    if (!userId) return;

    // WebSocket transport only (no long-polling fallback). The token is read fresh on every (re)connect.
    const socket = io(SOCKET_URL, {
      transports: ['websocket'],
      auth: (cb) => cb({ token: getAccessToken() }),
    });
    setState({ socket, connected: false, online: null });

    let invalidateTimer: ReturnType<typeof setTimeout> | undefined;
    const refreshViews = () => {
      clearTimeout(invalidateTimer);
      invalidateTimer = setTimeout(() => {
        for (const key of ['tasks', 'task', 'projects', 'project', 'dashboard']) {
          void queryClient.invalidateQueries({ queryKey: [key] });
        }
      }, 150);
    };

    socket.on('connect', () => {
      setState((s) => ({ ...s, connected: true }));
      // Coming back after a drop: anything we missed is re-read from the database.
      if (hasConnected.current) {
        void queryClient.invalidateQueries();
      }
      hasConnected.current = true;
    });
    socket.on('disconnect', (reason) => {
      setState((s) => ({ ...s, connected: false }));
      // The server closes the socket when the access token expires: refresh it and reconnect.
      if (reason === 'io server disconnect') {
        void refreshSession().then((session) => {
          if (session) socket.connect();
          else window.dispatchEvent(new Event('auth:logout'));
        });
      }
    });
    socket.on('connect_error', (err) => {
      if (err.message !== 'UNAUTHORIZED') return;
      void refreshSession().then((session) => {
        if (session) setTimeout(() => socket.connect(), 300);
        else window.dispatchEvent(new Event('auth:logout'));
      });
    });

    socket.on('task:changed', refreshViews);
    socket.on('presence:count', (p: { online: number }) => setState((s) => ({ ...s, online: p.online })));

    // Keep the long-lived socket authorised whenever the access token is silently renewed.
    const offToken = onTokenChange((token) => {
      if (token && socket.connected) socket.emit('auth:refresh', token);
    });

    return () => {
      offToken();
      clearTimeout(invalidateTimer);
      socket.disconnect();
      hasConnected.current = false;
      setState({ socket: null, connected: false, online: null });
    };
  }, [userId, queryClient]);

  return <SocketContext.Provider value={state}>{children}</SocketContext.Provider>;
}

export const useSocket = () => useContext(SocketContext);

/** Subscribe to a server event for as long as the component is mounted. */
export function useSocketEvent<T>(event: string, handler: (payload: T) => void) {
  const { socket } = useSocket();
  const latest = useRef(handler);
  latest.current = handler;
  useEffect(() => {
    if (!socket) return;
    const fn = (payload: T) => latest.current(payload);
    socket.on(event, fn);
    return () => {
      socket.off(event, fn);
    };
  }, [socket, event]);
}
