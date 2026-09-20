import { STATUSES, type Task, type TaskStatus } from '../types';
import { STATUS_LABEL, formatDue } from '../lib/format';
import { OverdueBadge, PriorityBadge } from './Badges';
import { StatusSelect } from './TaskTable';

export function StatusBar({ counts }: { counts: Record<TaskStatus, number> }) {
  const total = STATUSES.reduce((n, s) => n + counts[s], 0);
  return (
    <div>
      <div className="bar" role="img" aria-label={STATUSES.map((s) => `${STATUS_LABEL[s]} ${counts[s]}`).join(', ')}>
        {STATUSES.map((s) => counts[s] > 0 && <div key={s} className={`b-${s}`} style={{ width: `${(counts[s] / Math.max(total, 1)) * 100}%` }} title={`${STATUS_LABEL[s]}: ${counts[s]}`} />)}
      </div>
      <div className="legend">
        {STATUSES.map((s) => (
          <span key={s} className={`st-${s}`}>
            <i />
            <span style={{ color: 'var(--ink)' }}>
              {STATUS_LABEL[s]} <b className="num">{counts[s]}</b>
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}

export function MiniTaskTable({ tasks, onOpen, empty }: { tasks: Task[]; onOpen: (t: Task) => void; empty: string }) {
  if (tasks.length === 0) return <div className="empty">{empty}</div>;
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>Task</th>
            <th>Project</th>
            <th>Priority</th>
            <th>Status</th>
            <th>Due</th>
          </tr>
        </thead>
        <tbody>
          {tasks.map((t) => (
            <tr key={t.id}>
              <td className="num muted">#{t.id}</td>
              <td>
                <button className="title-btn" onClick={() => onOpen(t)}>
                  {t.title}
                </button>
              </td>
              <td>{t.project.name}</td>
              <td>
                <PriorityBadge priority={t.priority} />
              </td>
              <td>
                <StatusSelect task={t} />
              </td>
              <td className="num">
                <span className="row" style={{ gap: 8 }}>
                  {formatDue(t.dueDate)}
                  {t.isOverdue && <OverdueBadge />}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
