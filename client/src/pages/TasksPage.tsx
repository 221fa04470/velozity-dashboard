import { useAuth } from '../auth/AuthContext';
import { useOpenTask } from '../lib/useOpenTask';
import { TaskDrawer } from '../components/TaskDrawer';
import { TaskFilters, useTaskFilters } from '../components/TaskFilters';
import { TaskTable } from '../components/TaskTable';

export function TasksPage() {
  const { hasRole } = useAuth();
  const isDev = hasRole('DEVELOPER');
  const task = useOpenTask();
  const { filters, update, clear, active } = useTaskFilters();

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{isDev ? 'My tasks' : 'Tasks'}</h1>
          <p>{isDev ? 'Only tasks assigned to you. Most urgent first.' : hasRole('ADMIN') ? 'Every task across all projects.' : 'Tasks in the projects you manage.'}</p>
        </div>
      </div>
      <div className="panel">
        <TaskFilters filters={filters} update={update} clear={clear} active={active} />
        <TaskTable filters={filters} showAssignee={!isDev} onPage={(page) => update({ page })} onOpen={(t) => task.open(t.id)} />
      </div>
      {task.id && <TaskDrawer taskId={task.id} onClose={task.close} />}
    </>
  );
}
