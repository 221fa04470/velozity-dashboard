import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api, refreshSession, setAccessToken, type Session } from '../api/client';
import type { Role, User } from '../types';

interface AuthState {
  user: User | null;
  status: 'loading' | 'authed' | 'guest';
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  hasRole: (...roles: Role[]) => boolean;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [user, setUser] = useState<User | null>(null);
  const [status, setStatus] = useState<AuthState['status']>('loading');

  // On load, try to resume the session from the HttpOnly refresh cookie.
  useEffect(() => {
    let cancelled = false;
    refreshSession().then((session) => {
      if (cancelled) return;
      setUser(session?.user ?? null);
      setStatus(session ? 'authed' : 'guest');
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const clear = useCallback(() => {
    setAccessToken(null);
    queryClient.clear();
    setUser(null);
    setStatus('guest');
  }, [queryClient]);

  useEffect(() => {
    window.addEventListener('auth:logout', clear);
    return () => window.removeEventListener('auth:logout', clear);
  }, [clear]);

  const login = useCallback(async (email: string, password: string) => {
    const session = await api<Session>('/auth/login', { method: 'POST', body: { email, password } });
    setAccessToken(session.accessToken);
    setUser(session.user);
    setStatus('authed');
  }, []);

  const logout = useCallback(async () => {
    try {
      await api('/auth/logout', { method: 'POST' });
    } finally {
      clear();
    }
  }, [clear]);

  const value = useMemo<AuthState>(
    () => ({ user, status, login, logout, hasRole: (...roles) => !!user && roles.includes(user.role) }),
    [user, status, login, logout],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
