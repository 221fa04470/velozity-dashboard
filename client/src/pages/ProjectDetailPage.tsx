import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, api } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { useOpenTask } from '../lib/useOpenTask';
import type { Project } from '../types';
import { ActivityFeed } from '../components/ActivityFeed';
import { ProjectFormModal } from '../components/ProjectFormModal';
import { StatusBar } from '../components/Summary';
import { TaskDrawer } from '../components/TaskDrawer';
import { TaskFormModal } from '../components/TaskFormModal';
import { TaskFilters, useTaskFilters } from '../components/TaskFilters';
import { TaskTable } from '../components/TaskTable';

export function ProjectDetailPage() {
  const id = Number(useParams().id);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { hasRole } = useAuth();
  const canManage = hasRole('ADMIN', 'PROJECT_MANAGER');
  const task = useOpenTask();
  const { filters, update, clear, active } = useTaskFilters();
  const [newTask, setNewTask] = useState(false);
  const [editing, setEditing] = useState(false);

  const { data: project, isLoading, error } = useQuery({
    queryKey: ['project', id],
    queryFn: () => api<Project>(`/projects/${id}`),
    enabled: Number.isInteger(id),
    retry: false,
  });

  const remove = useMutation({
    mutationFn: () => api(`/projects/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      for (const key of ['projects', 'dashboard', 'tasks', 'activity']) void queryClient.invalidateQueries({ queryKey: [key] });
      navigate('/projects');
    },
  });

  if (isLoading) return <p className="muted">Loading project…</p>;
  if (error || !project) {
    return (
      <div className="panel">
        <div className="empty">
          {error instanceof ApiError && error.status === 404 ? 'This project does not exist, or you do not have access to it.' : (error as Error | null)?.message ?? 'Project not found.'}
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{project.name}</h1>
          <p>
            {project.client.name} · managed by {project.createdBy.name}
          </p>
        </div>
        <span className="spacer" />
        {canManage && (
          <div className="row">
            <button className="btn" onClick={() => setEditing(true)}>
              Edit project
            </button>
            <button className="btn danger" disabled={remove.isPending} onClick={() => window.confirm(`Delete "${project.name}" and all of its tasks?`) && remove.mutate()}>
              Delete
            </button>
            <button className="btn primary" onClick={() => setNewTask(true)}>
              New task
            </button>
          </div>
        )}
      </div>

      {project.description && <p style={{ marginBottom: 18, maxWidth: 760 }}>{project.description}</p>}
      <div className="panel" style={{ marginBottom: 22 }}>
        <div className="panel-body">
          <StatusBar counts={project.taskCounts} />
        </div>
      </div>

      <div className="layout-2">
        <div className="panel">
          <div className="panel-head">
            <h2>Tasks</h2>
          </div>
          <TaskFilters filters={filters} update={update} clear={clear} active={active} />
          <TaskTable filters={filters} projectId={id} showProject={false} onPage={(page) => update({ page })} onOpen={(t) => task.open(t.id)} />
        </div>
        <ActivityFeed projectId={id} title="Live activity in this project" maxHeight={720} />
      </div>

      {task.id && <TaskDrawer taskId={task.id} onClose={task.close} />}
      {newTask && <TaskFormModal projectId={id} onClose={() => setNewTask(false)} />}
      {editing && <ProjectFormModal project={project} onClose={() => setEditing(false)} />}
    </>
  );
}
