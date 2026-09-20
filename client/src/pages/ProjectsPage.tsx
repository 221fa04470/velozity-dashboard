import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { useProjects } from '../lib/queries';
import { ProjectFormModal } from '../components/ProjectFormModal';
import { StatusBar } from '../components/Summary';

export function ProjectsPage() {
  const { hasRole } = useAuth();
  const navigate = useNavigate();
  const { data, isLoading, error } = useProjects();
  const [creating, setCreating] = useState(false);
  const canCreate = hasRole('ADMIN', 'PROJECT_MANAGER');
  const isAdmin = hasRole('ADMIN');

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Projects</h1>
          <p>{hasRole('DEVELOPER') ? 'Projects you have tasks in.' : isAdmin ? 'Every client project.' : 'Projects you manage.'}</p>
        </div>
        <span className="spacer" />
        {canCreate && (
          <button className="btn primary" onClick={() => setCreating(true)}>
            New project
          </button>
        )}
      </div>

      <div className="panel">
        {isLoading && <div className="empty">Loading projects…</div>}
        {error && <div className="empty">{(error as Error).message}</div>}
        {data && data.length === 0 && <div className="empty">{canCreate ? 'No projects yet. Create the first one.' : 'You have no tasks in any project yet.'}</div>}
        {data && data.length > 0 && (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Project</th>
                  <th>Client</th>
                  {isAdmin && <th>Manager</th>}
                  <th style={{ width: '30%' }}>Task progress</th>
                  <th>Tasks</th>
                  <th>Overdue</th>
                </tr>
              </thead>
              <tbody>
                {data.map((p) => (
                  <tr key={p.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/projects/${p.id}`)}>
                    <td>
                      <Link to={`/projects/${p.id}`} onClick={(e) => e.stopPropagation()}>
                        <b>{p.name}</b>
                      </Link>
                    </td>
                    <td>{p.client.name}</td>
                    {isAdmin && <td>{p.createdBy.name}</td>}
                    <td>
                      <StatusBar counts={p.taskCounts} />
                    </td>
                    <td className="num">{p.totalTasks}</td>
                    <td className="num">{p.overdueTasks || <span className="muted">0</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {creating && <ProjectFormModal onClose={() => setCreating(false)} onSaved={(p) => navigate(`/projects/${p.id}`)} />}
    </>
  );
}
