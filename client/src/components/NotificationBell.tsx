import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { useSocketEvent } from '../realtime/SocketProvider';
import { timeAgo, useNow } from '../lib/format';
import type { AppNotification } from '../types';

interface NotificationData {
  data: AppNotification[];
  unreadCount: number;
}
const KEY = ['notifications'];

export function NotificationBell() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const now = useNow();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const { data } = useQuery({ queryKey: KEY, queryFn: () => api<NotificationData>('/notifications', { query: { limit: 20 } }) });
  const unread = data?.unreadCount ?? 0;

  // Real time: the server pushes new notifications and the fresh unread count. No polling anywhere.
  useSocketEvent<{ notification: AppNotification; unreadCount: number }>('notification:new', (p) =>
    queryClient.setQueryData<NotificationData>(KEY, (old) =>
      old ? { data: [p.notification, ...old.data.filter((n) => n.id !== p.notification.id)].slice(0, 20), unreadCount: p.unreadCount } : old,
    ),
  );
  useSocketEvent<{ unreadCount: number }>('notification:count', (p) =>
    queryClient.setQueryData<NotificationData>(KEY, (old) =>
      old ? { data: p.unreadCount === 0 ? old.data.map((n) => ({ ...n, read: true })) : old.data, unreadCount: p.unreadCount } : old,
    ),
  );

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !wrapRef.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const markRead = useMutation({
    mutationFn: (id: number) => api<{ unreadCount: number }>(`/notifications/${id}/read`, { method: 'POST' }),
    onSuccess: (res, id) =>
      queryClient.setQueryData<NotificationData>(KEY, (old) =>
        old ? { data: old.data.map((n) => (n.id === id ? { ...n, read: true } : n)), unreadCount: res.unreadCount } : old,
      ),
  });
  const markAll = useMutation({
    mutationFn: () => api<{ unreadCount: number }>('/notifications/read-all', { method: 'POST' }),
    onSuccess: () =>
      queryClient.setQueryData<NotificationData>(KEY, (old) => (old ? { data: old.data.map((n) => ({ ...n, read: true })), unreadCount: 0 } : old)),
  });

  const openNote = (n: AppNotification) => {
    if (!n.read) markRead.mutate(n.id);
    setOpen(false);
    if (n.projectId) navigate(`/projects/${n.projectId}${n.taskId ? `?task=${n.taskId}` : ''}`);
  };

  return (
    <div className="bell-wrap" ref={wrapRef}>
      <button className="bell" aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
        {unread > 0 && <span className="count">{unread > 99 ? '99+' : unread}</span>}
      </button>
      {open && (
        <div className="dropdown" role="dialog" aria-label="Notifications">
          <div className="panel-head">
            <h3>Notifications</h3>
            <span className="spacer" />
            <button className="btn small" disabled={unread === 0 || markAll.isPending} onClick={() => markAll.mutate()}>
              Mark all as read
            </button>
          </div>
          <div className="note-list">
            {!data || data.data.length === 0 ? (
              <div className="empty">You are all caught up.</div>
            ) : (
              data.data.map((n) => (
                <button key={n.id} className={`note${n.read ? '' : ' unread'}`} onClick={() => openNote(n)}>
                  <span className="u" aria-hidden />
                  <span>
                    <span style={{ display: 'block' }}>{n.message}</span>
                    <span className="muted small">{timeAgo(n.createdAt, now)}</span>
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
