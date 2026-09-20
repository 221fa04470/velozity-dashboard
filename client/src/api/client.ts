import type { User } from '../types';

const BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? '/api';

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: Array<{ path: string; message: string }>,
  ) {
    super(message);
  }
  /** Map server-side validation issues to { fieldName: message } for forms. */
  get fieldErrors(): Record<string, string> {
    return Object.fromEntries((this.details ?? []).map((d) => [d.path, d.message]));
  }
}

// The access token lives in memory only (never localStorage). The refresh token is an HttpOnly cookie
// that JavaScript cannot read at all.
let accessToken: string | null = null;
const listeners = new Set<(token: string | null) => void>();

export const getAccessToken = () => accessToken;
let renewTimer: ReturnType<typeof setTimeout> | undefined;

/** Renew the access token a minute before it expires so the live socket never has to drop. */
function scheduleRenewal(token: string | null) {
  clearTimeout(renewTimer);
  if (!token) return;
  try {
    const payload = JSON.parse(atob(token.split('.')[1]!.replace(/-/g, '+').replace(/_/g, '/'))) as { exp: number };
    const delay = Math.max(5_000, payload.exp * 1000 - Date.now() - 60_000);
    renewTimer = setTimeout(() => {
      void refreshSession().then((session) => {
        if (!session) window.dispatchEvent(new Event('auth:logout'));
      });
    }, delay);
  } catch {
    /* an unreadable token simply falls back to refresh-on-401 */
  }
}

export function setAccessToken(token: string | null) {
  accessToken = token;
  scheduleRenewal(token);
  listeners.forEach((fn) => fn(token));
}
export function onTokenChange(fn: (token: string | null) => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export interface Session {
  accessToken: string;
  user: User;
}

const baseHeaders = { 'Content-Type': 'application/json', 'X-Requested-With': 'velozity-client' };

let refreshing: Promise<Session | null> | null = null;

/**
 * Single-flight refresh. Refresh tokens rotate (each one works once), so two refreshes at the same
 * time would trip reuse detection. One promise per tab, plus a Web Lock so several tabs take turns.
 */
export function refreshSession(): Promise<Session | null> {
  if (!refreshing) {
    const run = async (): Promise<Session | null> => {
      try {
        const res = await fetch(`${BASE}/auth/refresh`, { method: 'POST', credentials: 'include', headers: baseHeaders });
        if (!res.ok) {
          setAccessToken(null);
          return null;
        }
        const session = (await res.json()) as Session;
        setAccessToken(session.accessToken);
        return session;
      } catch {
        return null;
      }
    };
    const locked = 'locks' in navigator ? navigator.locks.request('velozity-refresh', run) : run();
    refreshing = Promise.resolve(locked).finally(() => {
      refreshing = null;
    });
  }
  return refreshing;
}

type Query = Record<string, string | number | boolean | undefined | null>;

export function toQueryString(query?: Query): string {
  if (!query) return '';
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) if (v !== undefined && v !== null && v !== '') p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : '';
}

export async function api<T = unknown>(
  path: string,
  opts: { method?: string; body?: unknown; query?: Query } = {},
): Promise<T> {
  const send = () =>
    fetch(`${BASE}${path}${toQueryString(opts.query)}`, {
      method: opts.method ?? 'GET',
      credentials: 'include',
      headers: { ...baseHeaders, ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) },
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    });

  let res = await send();

  // Access token expired: silently refresh once and replay the request.
  if (res.status === 401 && accessToken && !path.startsWith('/auth/')) {
    const session = await refreshSession();
    if (session) res = await send();
    else window.dispatchEvent(new Event('auth:logout'));
  }

  if (res.status === 204) return undefined as T;
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const e = json?.error;
    throw new ApiError(res.status, e?.code ?? 'UNKNOWN', e?.message ?? 'Something went wrong', e?.details);
  }
  return json as T;
}
