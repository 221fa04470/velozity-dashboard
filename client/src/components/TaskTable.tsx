import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { formatDue } from '../lib/format';
import { STATUSES, type Paged, type Task, type TaskStatus } from '../types';
import { OverdueBadge, PriorityBadge } from './Badges';
import { filtersToQuery, type TaskFilterState } from './TaskFilters';
import { STATUS_LABEL } from '../lib/format';

export function StatusSelect({ task }: { task: Pick<Task, 'id' | 'status'> }) {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: (status: TaskStatus) => api(`/tasks/${task.id}/status`, { method: 'PATCH', body: { status } }),
    onSuccess: () => {
      for (const key of ['tasks', 'task', 'projects', 'project', 'dashboard']) void queryClient.invalidateQueries({ queryKey: [key] });
    },
  });
  return (
    <select
      className={`st-select st-${task.status}`}
      value={task.status}
      disabled={mutation.isPending}
      aria-label="Change status"
      onChange={(e) => mutation.mutate(e.target.value as TaskStatus)}
      onClick={(e) => e.stopPropagation()}
    >
      {STATUSES.map((s) => (
        <option key={s} value={s}>
          {STATUS_LABEL[s]}
        </option>
      ))}
    </select>
  );
}

interface Props {
  filters: TaskFilterState;
  onPage: (page: number) => void;
  onOpen: (task: Task) => void;
  projectId?: number;
  showProject?: boolean;
  showAssignee?: boolean;
}

export function TaskTable({ filters, onPage, onOpen, projectId, showProject = true, showAssignee = true }: Props) {
  const query = { ...filtersToQuery(filters), projectId, pageSize: 20 };
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['tasks', query],
    queryFn: () => api<Paged<Task>>('/tasks', { query }),
    placeholderData: keepPreviousData,
  });

  if (isLoading) return <div className="empty">Loading tasks…</div>;
  if (isError) return <div className="empty">Could not load tasks: {(error as Error).message}</div>;
  if (!data || data.data.length === 0) return <div className="empty">No tasks match these filters.</div>;

  return (
    <>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Task</th>
              {showProject && <th>Project</th>}
              {showAssignee && <th>Assignee</th>}
              <th>Priority</th>
              <th>Status</th>
              <th>Due</th>
            </tr>
          </thead>
          <tbody>
            {data.data.map((t) => (
              <tr key={t.id}>
                <td className="num muted">#{t.id}</td>
                <td>
                  <button className="title-btn" onClick={() => onOpen(t)}>
                    {t.title}
                  </button>
                </td>
                {showProject && <td>{t.project.name}</td>}
                {showAssignee && <td>{t.assignee?.name ?? <span className="muted">Unassigned</span>}</td>}
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
      <div className="pager">
        <span className="muted">
          {data.meta.total} task{data.meta.total === 1 ? '' : 's'}
        </span>
        <span className="spacer" />
        <button className="btn small" disabled={data.meta.page <= 1} onClick={() => onPage(data.meta.page - 1)}>
          Previous
        </button>
        <span className="num">
          Page {data.meta.page} of {data.meta.totalPages}
        </span>
        <button className="btn small" disabled={data.meta.page >= data.meta.totalPages} onClick={() => onPage(data.meta.page + 1)}>
          Next
        </button>
      </div>
    </>
  );
}

