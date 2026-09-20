import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { useSocket } from '../realtime/SocketProvider';
import { useOpenTask } from '../lib/useOpenTask';
import { PRIORITIES, type AdminDashboard, type Dashboard, type DeveloperDashboard, type ManagerDashboard, type Project, type Task } from '../types';
import { PRIORITY_LABEL } from '../lib/format';
import { ActivityFeed } from '../components/ActivityFeed';
import { MiniTaskTable, StatusBar } from '../components/Summary';
import { TaskDrawer } from '../components/TaskDrawer';
import { useProjects } from '../lib/queries';

function Stat({ value, label, alert, children }: { value: number | string; label: string; alert?: boolean; children?: React.ReactNode }) {
  return (
    <div className={`stat${alert && Number(value) > 0 ? ' alert' : ''}`}>
      <b>{value}</b>
      <span>{label}</span>
      {children}
    </div>
  );
}

function ProjectRows({ projects }: { projects: Project[] }) {
  const navigate = useNavigate();
  if (projects.length === 0) return <div className="empty">No projects yet.</div>;
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Project</th>
            <th>Client</th>
            <th style={{ width: '34%' }}>Progress</th>
            <th>Overdue</th>
          </tr>
        </thead>
        <tbody>
          {projects.map((p) => (
            <tr key={p.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/projects/${p.id}`)}>
              <td>
                <Link to={`/projects/${p.id}`} onClick={(e) => e.stopPropagation()}>
                  <b>{p.name}</b>
                </Link>
              </td>
              <td>{p.client.name}</td>
              <td>
                <StatusBar counts={p.taskCounts} />
              </td>
              <td className="num">{p.overdueTasks || <span className="muted">0</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AdminView({ d }: { d: AdminDashboard }) {
  const { online } = useSocket();
  const projects = useProjects();
  return (
    <>
      <div className="stats">
        <Stat value={d.totalProjects} label="Projects" />
        <Stat value={d.totalTasks} label="Tasks" />
        <Stat value={d.overdueTasks} label="Overdue tasks" alert />
        <Stat value={online ?? d.onlineNow} label="People online now">
          <div className="live">
            <span className="dot on" /> Live count
          </div>
        </Stat>
      </div>
      <div className="panel" style={{ marginBottom: 22 }}>
        <div className="panel-head">
          <h2>All tasks by status</h2>
          <span className="spacer" />
          {d.overdueTasks > 0 && <Link to="/tasks?overdue=true">See {d.overdueTasks} overdue</Link>}
        </div>
        <div className="panel-body">
          <StatusBar counts={d.tasksByStatus} />
        </div>
      </div>
      <div className="panel">
        <div className="panel-head">
          <h2>Projects</h2>
          <span className="spacer" />
          <Link to="/projects">All projects</Link>
        </div>
        <ProjectRows projects={projects.data ?? []} />
      </div>
    </>
  );
}

function ManagerView({ d, onOpen }: { d: ManagerDashboard; onOpen: (t: Task) => void }) {
  const open = PRIORITIES.reduce((n, p) => n + d.openTasksByPriority[p], 0);
  const max = Math.max(1, ...PRIORITIES.map((p) => d.openTasksByPriority[p]));
  return (
    <>
      <div className="stats">
        <Stat value={d.projects.length} label="Your projects" />
        <Stat value={open} label="Open tasks" />
        <Stat value={d.dueThisWeek.length} label="Due in the next 7 days" />
        <Stat value={d.overdueTasks} label="Overdue tasks" alert />
      </div>
      <div className="panel" style={{ marginBottom: 22 }}>
        <div className="panel-head">
          <h2>Open tasks by priority</h2>
        </div>
        <div className="panel-body pbars">
          {[...PRIORITIES].reverse().map((p) => (
            <div className={`pbar pri-${p}`} key={p}>
              <span style={{ color: 'var(--ink)' }}>{PRIORITY_LABEL[p]}</span>
              <div className="track">
                <div style={{ width: `${(d.openTasksByPriority[p] / max) * 100}%` }} />
              </div>
              <b className="num" style={{ color: 'var(--ink)' }}>
                {d.openTasksByPriority[p]}
              </b>
            </div>
          ))}
        </div>
      </div>
      <div className="panel" style={{ marginBottom: 22 }}>
        <div className="panel-head">
          <h2>Due this week</h2>
        </div>
        <MiniTaskTable tasks={d.dueThisWeek} onOpen={onOpen} empty="Nothing is due in the next 7 days." />
      </div>
      <div className="panel">
        <div className="panel-head">
          <h2>Your projects</h2>
          <span className="spacer" />
          <Link to="/projects">All projects</Link>
        </div>
        <ProjectRows projects={d.projects} />
      </div>
    </>
  );
}

function DeveloperView({ d, onOpen }: { d: DeveloperDashboard; onOpen: (t: Task) => void }) {
  return (
    <>
      <div className="stats">
        <Stat value={d.tasksByStatus.TODO} label="To do" />
        <Stat value={d.tasksByStatus.IN_PROGRESS} label="In progress" />
        <Stat value={d.tasksByStatus.IN_REVIEW} label="In review" />
        <Stat value={d.overdueTasks} label="Overdue" alert />
      </div>
      <div className="panel">
        <div className="panel-head">
          <h2>Your open tasks</h2>
          <span className="muted small">Most urgent first, then soonest due</span>
          <span className="spacer" />
          <Link to="/tasks">All my tasks</Link>
        </div>
        <MiniTaskTable tasks={d.assignedTasks} onOpen={onOpen} empty="Nothing assigned to you right now." />
      </div>
    </>
  );
}

export function DashboardPage() {
  const { user } = useAuth();
  const task = useOpenTask();
  const { data, isLoading, error } = useQuery({ queryKey: ['dashboard'], queryFn: () => api<Dashboard>('/dashboard') });
  const feedTitle = user?.role === 'DEVELOPER' ? 'Activity on your tasks' : user?.role === 'PROJECT_MANAGER' ? 'Activity in your projects' : 'Activity across all projects';

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Good to see you, {user?.name.split(' ')[0]}</h1>
          <p>{user?.role === 'ADMIN' ? 'Everything across the agency, live.' : user?.role === 'PROJECT_MANAGER' ? 'Where your projects stand right now.' : 'What needs your attention next.'}</p>
        </div>
      </div>
      {isLoading && <p className="muted">Loading dashboard…</p>}
      {error && <p className="form-error">{(error as Error).message}</p>}
      {data && (
        <div className="layout-2">
          <div>
            {data.role === 'ADMIN' && <AdminView d={data} />}
            {data.role === 'PROJECT_MANAGER' && <ManagerView d={data} onOpen={(t) => task.open(t.id)} />}
            {data.role === 'DEVELOPER' && <DeveloperView d={data} onOpen={(t) => task.open(t.id)} />}
          </div>
          <ActivityFeed title={feedTitle} maxHeight={720} />
        </div>
      )}
      {task.id && <TaskDrawer taskId={task.id} onClose={task.close} />}
    </>
  );
}
