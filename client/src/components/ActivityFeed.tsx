import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { useSocket, useSocketEvent } from '../realtime/SocketProvider';
import { formatDateTime, timeAgo, useNow } from '../lib/format';
import type { Activity } from '../types';
import { Avatar, StatusChip } from './Badges';

interface FeedData {
  data: Activity[];
  nextCursor: number | null;
}
interface MissedData {
  since: string | null;
  total: number;
  events: Activity[];
}

const firstName = (name?: string | null) => name?.split(' ')[0] ?? 'System';

/** "Ravi moved Task #12 from In Progress → In Review · 2 mins ago" */
export function ActivityLine({ a, now }: { a: Activity; now: number }) {
  const task = (
    <Link to={`/projects/${a.project.id}?task=${a.task.id}`}>Task #{a.task.id}</Link>
  );
  const who = <b title={a.actor?.name}>{firstName(a.actor?.name)}</b>;
  const ago = <span className="muted"> · {timeAgo(a.createdAt, now)}</span>;

  switch (a.type) {
    case 'STATUS_CHANGED':
      return (
        <p className="feed-text">
          {who} moved {task} from {a.fromStatus && <StatusChip status={a.fromStatus} />} → {a.toStatus && <StatusChip status={a.toStatus} />}
          {ago}
        </p>
      );
    case 'TASK_CREATED':
      return (
        <p className="feed-text">
          {who} created {task}
          {a.detail ? ` · ${a.detail}` : ''}
          {ago}
        </p>
      );
    case 'ASSIGNEE_CHANGED':
      return (
        <p className="feed-text">
          {who} {a.detail?.startsWith('assigned to ') ? <>assigned {task} to {a.detail.replace('assigned to ', '')}</> : <>unassigned {task}</>}
          {ago}
        </p>
      );
    case 'TASK_OVERDUE':
      return (
        <p className="feed-text">
          {task} is now <b style={{ color: 'var(--brick)' }}>overdue</b>
          {ago}
        </p>
      );
  }
}

export function ActivityFeed({ projectId, title = 'Live activity', maxHeight }: { projectId?: number; title?: string; maxHeight?: number }) {
  const queryClient = useQueryClient();
  const { connected } = useSocket();
  const now = useNow();
  const [limit, setLimit] = useState(20);
  const liveIds = useRef(new Set<number>());
  const scope = projectId ?? 'all';
  const key = ['activity', scope, limit];

  // Both the feed and the "missed while offline" summary come from Postgres, never from memory.
  const feed = useQuery({
    queryKey: key,
    queryFn: () => api<FeedData>('/activity', { query: { limit, projectId } }),
  });
  const missed = useQuery({
    queryKey: ['activity-missed'],
    enabled: !projectId,
    queryFn: () => api<MissedData>('/activity/missed'),
  });
  const markSeen = useMutation({
    mutationFn: () => api('/activity/seen', { method: 'POST' }),
    onSuccess: () => queryClient.setQueryData<MissedData>(['activity-missed'], { since: null, total: 0, events: [] }),
  });

  // Live: prepend events pushed over the WebSocket. The server only sends what this user may see.
  useSocketEvent<Activity>('activity:new', (a) => {
    if (projectId && a.project.id !== projectId) return;
    liveIds.current.add(a.id);
    queryClient.setQueryData<FeedData>(key, (old) =>
      old ? { ...old, data: old.data.some((x) => x.id === a.id) ? old.data : [a, ...old.data].slice(0, limit) } : old,
    );
  });

  const since = missed.data?.since && missed.data.total > 0 ? new Date(missed.data.since).getTime() : null;
  const items = feed.data?.data ?? [];
  let dividerShown = false;

  return (
    <section className="panel" aria-label={title}>
      <div className="panel-head">
        <h2>{title}</h2>
        <span className="spacer" />
        <span className="live">
          <span className={`dot${connected ? ' on' : ''}`} />
          {connected ? 'Live' : 'Reconnecting'}
        </span>
      </div>

      {since !== null && missed.data && (
        <div className="banner" role="status">
          <span>
            You missed <b>{missed.data.total}</b> update{missed.data.total === 1 ? '' : 's'} since {formatDateTime(missed.data.since!)}
            {missed.data.total > missed.data.events.length ? ` (showing the latest ${missed.data.events.length})` : ''}.
          </span>
          <span className="spacer" />
          <button className="btn small" onClick={() => markSeen.mutate()}>
            Mark as seen
          </button>
        </div>
      )}

      <div className="feed-body" style={maxHeight ? { maxHeight } : undefined}>
        {feed.isLoading && <div className="empty">Loading activity…</div>}
        {feed.isError && <div className="empty">Could not load activity.</div>}
        {feed.data && items.length === 0 && <div className="empty">Nothing has happened yet. Move a task to see it appear here.</div>}
        <ul className="feed">
          {items.map((a) => {
            const isNew = since !== null && new Date(a.createdAt).getTime() > since;
            const showDivider = since !== null && !isNew && !dividerShown;
            if (showDivider) dividerShown = true;
            return (
              <li key={a.id} style={{ display: 'contents' }}>
                {showDivider && <div className="divider">Older than your last visit</div>}
                <div className={`feed-item${isNew ? ' fresh' : ''}${liveIds.current.has(a.id) ? ' enter' : ''}`}>
                  <Avatar name={a.actor?.name} system={!a.actor} />
                  <div>
                    <ActivityLine a={a} now={now} />
                    <div className="feed-sub">
                      <span>{a.task.title}</span>
                      {!projectId && <span>{a.project.name}</span>}
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
        {feed.data?.nextCursor && (
          <div className="pager">
            <button className="btn small" onClick={() => setLimit((l) => l + 20)}>
              Show older activity
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
