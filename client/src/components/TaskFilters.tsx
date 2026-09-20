import { useCallback, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PRIORITIES, STATUSES, type Priority, type TaskStatus } from '../types';
import { PRIORITY_LABEL, STATUS_LABEL } from '../lib/format';

export interface TaskFilterState {
  status: TaskStatus[];
  priority: Priority[];
  dueFrom: string;
  dueTo: string;
  overdue: boolean;
  q: string;
  page: number;
}

const parseList = <T extends string>(raw: string | null, allowed: readonly T[]): T[] =>
  (raw ?? '')
    .split(',')
    .filter((v): v is T => (allowed as readonly string[]).includes(v));

/**
 * Filter state lives in the URL (?status=IN_REVIEW&priority=HIGH,CRITICAL&dueFrom=2026-09-01...),
 * so any filtered view can be copied, bookmarked and shared. The same names are sent to the API.
 */
export function useTaskFilters() {
  const [params, setParams] = useSearchParams();

  const filters = useMemo<TaskFilterState>(
    () => ({
      status: parseList(params.get('status'), STATUSES),
      priority: parseList(params.get('priority'), PRIORITIES),
      dueFrom: params.get('dueFrom') ?? '',
      dueTo: params.get('dueTo') ?? '',
      overdue: params.get('overdue') === 'true',
      q: params.get('q') ?? '',
      page: Math.max(1, Number(params.get('page')) || 1),
    }),
    [params],
  );

  const update = useCallback(
    (patch: Partial<TaskFilterState>) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          const merged = { ...filters, ...patch, ...('page' in patch ? {} : { page: 1 }) };
          const set = (k: string, v: string) => (v ? next.set(k, v) : next.delete(k));
          set('status', merged.status.join(','));
          set('priority', merged.priority.join(','));
          set('dueFrom', merged.dueFrom);
          set('dueTo', merged.dueTo);
          set('overdue', merged.overdue ? 'true' : '');
          set('q', merged.q);
          set('page', merged.page > 1 ? String(merged.page) : '');
          return next;
        },
        { replace: true },
      );
    },
    [filters, setParams],
  );

  const clear = useCallback(() => update({ status: [], priority: [], dueFrom: '', dueTo: '', overdue: false, q: '' }), [update]);
  const active = filters.status.length + filters.priority.length + (filters.dueFrom ? 1 : 0) + (filters.dueTo ? 1 : 0) + (filters.overdue ? 1 : 0) + (filters.q ? 1 : 0);
  return { filters, update, clear, active };
}

export const filtersToQuery = (f: TaskFilterState) => ({
  status: f.status.join(',') || undefined,
  priority: f.priority.join(',') || undefined,
  dueFrom: f.dueFrom || undefined,
  dueTo: f.dueTo || undefined,
  overdue: f.overdue ? 'true' : undefined,
  q: f.q || undefined,
  page: f.page,
});

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

export function TaskFilters({
  filters,
  update,
  clear,
  active,
}: {
  filters: TaskFilterState;
  update: (patch: Partial<TaskFilterState>) => void;
  clear: () => void;
  active: number;
}) {
  const [copied, setCopied] = useState(false);
  const copyLink = async () => {
    await navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  return (
    <div className="filters" role="search">
      <div className="group">
        <span>Status</span>
        <div className="toggles">
          {STATUSES.map((s) => (
            <button key={s} className="toggle" aria-pressed={filters.status.includes(s)} onClick={() => update({ status: toggle(filters.status, s) })}>
              {STATUS_LABEL[s]}
            </button>
          ))}
        </div>
      </div>
      <div className="group">
        <span>Priority</span>
        <div className="toggles">
          {PRIORITIES.map((p) => (
            <button key={p} className="toggle" aria-pressed={filters.priority.includes(p)} onClick={() => update({ priority: toggle(filters.priority, p) })}>
              {PRIORITY_LABEL[p]}
            </button>
          ))}
        </div>
      </div>
      <div className="group">
        <span>Due from</span>
        <input className="input" type="date" value={filters.dueFrom} max={filters.dueTo || undefined} onChange={(e) => update({ dueFrom: e.target.value })} />
      </div>
      <div className="group">
        <span>Due to</span>
        <input className="input" type="date" value={filters.dueTo} min={filters.dueFrom || undefined} onChange={(e) => update({ dueTo: e.target.value })} />
      </div>
      <div className="group">
        <span>Overdue</span>
        <div className="toggles">
          <button className="toggle" aria-pressed={filters.overdue} onClick={() => update({ overdue: !filters.overdue })}>
            Overdue only
          </button>
        </div>
      </div>
      <div className="group">
        <span>Search</span>
        <input className="input" placeholder="Task title" defaultValue={filters.q} key={filters.q} onKeyDown={(e) => e.key === 'Enter' && update({ q: e.currentTarget.value.trim() })} onBlur={(e) => e.target.value.trim() !== filters.q && update({ q: e.target.value.trim() })} />
      </div>
      <div className="row" style={{ marginLeft: 'auto' }}>
        {active > 0 && (
          <button className="btn ghost small" onClick={clear}>
            Clear filters
          </button>
        )}
        <button className="btn small" onClick={copyLink}>
          {copied ? 'Link copied' : 'Copy link to this view'}
        </button>
      </div>
    </div>
  );
}
