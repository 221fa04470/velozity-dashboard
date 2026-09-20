import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, api } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { formatDue, useNow } from '../lib/format';
import type { TaskDetail } from '../types';
import { Avatar, OverdueBadge, PriorityBadge } from './Badges';
import { ActivityLine } from './ActivityFeed';
import { StatusSelect } from './TaskTable';
import { TaskFormModal } from './TaskFormModal';

export function TaskDrawer({ taskId, onClose }: { taskId: number; onClose: () => void }) {
  const { hasRole } = useAuth();
  const queryClient = useQueryClient();
  const now = useNow();
  const [editing, setEditing] = useState(false);
  const canManage = hasRole('ADMIN', 'PROJECT_MANAGER');

  const { data, isLoading, error } = useQuery({
    queryKey: ['task', taskId],
    queryFn: () => api<TaskDetail>(`/tasks/${taskId}`),
    retry: false,
  });

  const remove = useMutation({
    mutationFn: () => api(`/tasks/${taskId}`, { method: 'DELETE' }),
    onSuccess: () => {
      for (const key of ['tasks', 'projects', 'project', 'dashboard', 'activity']) void queryClient.invalidateQueries({ queryKey: [key] });
      onClose();
    },
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !editing && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, editing]);

  return (
    <div className="drawer-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside className="drawer" role="dialog" aria-label={`Task #${taskId}`}>
        <div className="drawer-head">
          <div className="row">
            <span className="muted num">Task #{taskId}</span>
            <span className="spacer" />
            <button className="btn ghost small" onClick={onClose}>
              Close
            </button>
          </div>
          {data && <h2 style={{ marginTop: 6, fontSize: 22 }}>{data.title}</h2>}
        </div>

        <div className="drawer-body">
          {isLoading && <p className="muted">Loading…</p>}
          {error && (
            <p className="form-error">{error instanceof ApiError && error.status === 404 ? 'This task does not exist or is no longer assigned to you.' : (error as Error).message}</p>
          )}
          {data && (
            <>
              <dl className="meta-grid">
                <dt>Status</dt>
                <dd>
                  <StatusSelect task={data} />
                </dd>
                <dt>Priority</dt>
                <dd>
                  <PriorityBadge priority={data.priority} />
                </dd>
                <dt>Due</dt>
                <dd className="row" style={{ gap: 8 }}>
                  {formatDue(data.dueDate)} {data.isOverdue && <OverdueBadge />}
                </dd>
                <dt>Assignee</dt>
                <dd>{data.assignee?.name ?? <span className="muted">Unassigned</span>}</dd>
                <dt>Project</dt>
                <dd>{data.project.name}</dd>
              </dl>

              <div>
                <h3 style={{ marginBottom: 6 }}>Description</h3>
                <p style={{ whiteSpace: 'pre-wrap' }}>{data.description || <span className="muted">No description.</span>}</p>
              </div>

              {canManage && (
                <div className="row">
                  <button className="btn" onClick={() => setEditing(true)}>
                    Edit task
                  </button>
                  <button
                    className="btn danger"
                    disabled={remove.isPending}
                    onClick={() => window.confirm(`Delete Task #${data.id}? This also removes its history.`) && remove.mutate()}
                  >
                    Delete
                  </button>
                </div>
              )}

              <div>
                <h3 style={{ marginBottom: 8 }}>History</h3>
                <ul className="feed" style={{ border: '1px solid var(--line)', borderRadius: 10 }}>
                  {data.activity.map((a) => (
                    <li className="feed-item" key={a.id}>
                      <Avatar name={a.actor?.name} system={!a.actor} />
                      <ActivityLine a={a} now={now} />
                    </li>
                  ))}
                </ul>
              </div>
            </>
          )}
        </div>
      </aside>
      {editing && data && <TaskFormModal task={data} onClose={() => setEditing(false)} />}
    </div>
  );
}
