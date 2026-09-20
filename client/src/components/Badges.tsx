import type { Priority, TaskStatus } from '../types';
import { PRIORITY_LABEL, STATUS_LABEL } from '../lib/format';

export function StatusChip({ status }: { status: TaskStatus }) {
  return (
    <span className={`chip st-${status}`}>
      <span>{STATUS_LABEL[status]}</span>
    </span>
  );
}

export function PriorityBadge({ priority }: { priority: Priority }) {
  return (
    <span className={`pri pri-${priority}`}>
      <i aria-hidden>
        <b />
        <b />
        <b />
        <b />
      </i>
      {PRIORITY_LABEL[priority]}
    </span>
  );
}

export const OverdueBadge = () => <span className="badge-overdue">Overdue</span>;

export function Avatar({ name, system }: { name?: string | null; system?: boolean }) {
  const initials = (name ?? 'System')
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
  return (
    <span className={`avatar${system ? ' system' : ''}`} aria-hidden>
      {system ? '!' : initials}
    </span>
  );
}
